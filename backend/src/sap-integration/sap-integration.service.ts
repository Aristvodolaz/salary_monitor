import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';
import axios, { AxiosInstance } from 'axios';
import * as sql from 'mssql';
import * as http from 'http';
import * as https from 'https';

// ────────────────────────────────────────────────────────────────
// Типы
// ────────────────────────────────────────────────────────────────

interface SyncContext {
  warehouseId: number;
  warehouseCode: string;
  /** employee_id → user DB id */
  userMap: Map<string, number>;
  /** operation_type → tariff */
  tariffMap: Map<string, { rate: number; norm_aei_per_hour: number | null }>;
  /** wcr_code → { operation_type, participant_area } */
  wcrMap: Map<string, { operation_type: string; participant_area: string }>;
}

interface ParsedOperation {
  employeeId: string;
  employeeName1: string;
  employeeName2: string;
  warehouseCode: string;
  /** Фактическое АЕИ из ZsumAmountItm — блок 1 (приёмка, размещение, пополнение) */
  aeiCount: number;
  /** Кол-во продуктовых задач из ZprodWtItm — блок 2 (комплектация) */
  prodCount: number;
  /** Фактическое время (минуты) — только для логов/справки */
  actdura: number;
  operationDate: Date;
  sapOrderId: string | null;
  wcr: string;
  aarea: string | null;  // зона активности из SAP WHOSet.Aarea
}

interface OperationRow {
  userId: number;
  warehouseCode: string;
  operationType: string;
  participantArea: string;
  count: number;       // АЕИ (ZsumAmountItm) — блок 1
  prodCount: number;   // продуктовые задачи (ZprodWtItm) — блок 2
  actdura: number;     // минуты
  operationDate: Date;
  amount: number;      // count * rate = Вn × Рm
  sapOrderId: string | null;
  wcrCode: string | null;   // оригинальный WCR-код из SAP
  aarea: string | null;     // зона активности из SAP WHOSet.Aarea
}

interface DateChunk {
  startDate: Date;
  endDate: Date;
}

// ────────────────────────────────────────────────────────────────
// Сервис
// ────────────────────────────────────────────────────────────────

@Injectable()
export class SapIntegrationService {
  private axiosInstance: AxiosInstance;
  private readonly CHUNK_DAYS          = 1;
  private readonly WAREHOUSE_CONCURRENCY = 1;  // последовательная обработка складов, чтобы не упасть по памяти
  private readonly CHUNK_CONCURRENCY   = 1;    // последовательные чанки SAP
  private readonly BATCH_SIZE          = 500;  // записей на один bulk-insert

  constructor(
    private configService: ConfigService,
    private db: DatabaseService,
    private logger: LoggerService,
  ) {
    const sapBaseUrl = this.configService.get<string>('SAP_ODATA_BASE_URL');
    const sapUser    = this.configService.get<string>('SAP_USERNAME');
    const sapPass    = this.configService.get<string>('SAP_PASSWORD');

    this.logger.log(`SAP baseURL: ${sapBaseUrl}`);

    this.axiosInstance = axios.create({
      baseURL: sapBaseUrl,
      auth: { username: sapUser, password: sapPass },
      timeout: 120_000,
      proxy: false, // Игнорируем HTTP_PROXY/HTTPS_PROXY из окружения
      // HTTP Keep-Alive: переиспользуем TCP-соединения между запросами
      httpAgent:  new http.Agent({ keepAlive: true, maxSockets: 5 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 5 }),
      validateStatus: (status) => status < 500,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────────

  /**
   * Ежедневная синхронизация — только вчера (24 часа)
   * Вызывается планировщиком в 02:00
   */
  async syncYesterday(): Promise<void> {
    const now       = new Date();
    const todayUtc  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yestStart = new Date(todayUtc);
    yestStart.setUTCDate(yestStart.getUTCDate() - 1);
    const yestEnd   = new Date(todayUtc.getTime() - 1); // 23:59:59.999 вчера

    this.logger.log(`📅 Ежедневный sync: ${yestStart.toISOString().slice(0, 10)}`);
    await this.syncAllWarehouses(yestStart, yestEnd);
  }

  /**
   * Ручной пересчёт произвольного периода
   * Пример: syncPeriod(new Date('2026-02-01'), new Date('2026-02-28'))
   */
  async syncPeriod(start: Date, end: Date): Promise<void> {
    this.logger.log(
      `📅 Ручной sync: ${start.toISOString().slice(0, 10)} — ${end.toISOString().slice(0, 10)}`,
    );
    await this.syncAllWarehouses(start, end);
  }

  /**
   * Ручной запуск для одного склада
   */
  async syncWarehouseManual(warehouseCode: string, start: Date, end: Date): Promise<void> {
    await this.syncWarehouse(warehouseCode, start, end);
  }

  /**
   * Выгрузка ТОЛЬКО нормативных WCR-кодов за период.
   *
   * Отличия от syncPeriod:
   * - Не удаляет существующие записи (нет DELETE → безопасно для старых данных)
   * - Фильтрует SAP-записи: пропускает всё, чей WCR не входит в wcr_norms / wcr_picking_norms
   * - Если WCR есть в нормативах, но нет в wcr_mapping — сохраняет как есть (wcr_code сохраняется)
   */
  async syncNormsOnly(
    start: Date,
    end: Date,
  ): Promise<{ saved: number; skipped: number; warehouses: string[] }> {
    this.logger.log(
      `🎯 syncNormsOnly: ${start.toISOString().slice(0, 10)} — ${end.toISOString().slice(0, 10)}`,
    );

    // 1. Загружаем все нормативные WCR-коды (блок 1 + блок 2)
    const normsWcrRows = await this.db.query<{ wcr_code: string }>(
      `SELECT wcr_code FROM wcr_norms WHERE is_active = 1
       UNION
       SELECT wcr_code FROM wcr_picking_norms WHERE is_active = 1`,
    );
    const normsSet = new Set(normsWcrRows.map((r) => r.wcr_code));
    this.logger.log(`   Нормативных WCR-кодов: ${normsSet.size}`);

    // 2. Все активные склады
    const warehouses = await this.db.query<{ code: string }>(
      `SELECT code FROM warehouses WHERE is_active = 1 ORDER BY code`,
    );

    let totalSaved   = 0;
    let totalSkipped = 0;
    const processedWarehouses: string[] = [];

    for (let i = 0; i < warehouses.length; i += this.WAREHOUSE_CONCURRENCY) {
      const batch = warehouses.slice(i, i + this.WAREHOUSE_CONCURRENCY);
      const results = await Promise.all(
        batch.map((w) => this.syncNormsWarehouse(w.code, start, end, normsSet)),
      );
      for (const r of results) {
        totalSaved   += r.saved;
        totalSkipped += r.skipped;
        processedWarehouses.push(r.warehouseCode);
      }
    }

    this.logger.log(
      `✅ syncNormsOnly завершён: сохранено=${totalSaved}, пропущено=${totalSkipped}`,
    );
    return { saved: totalSaved, skipped: totalSkipped, warehouses: processedWarehouses };
  }

  private async syncNormsWarehouse(
    warehouseCode: string,
    start: Date,
    end: Date,
    normsSet: Set<string>,
  ): Promise<{ warehouseCode: string; saved: number; skipped: number }> {
    let saved   = 0;
    let skipped = 0;

    try {
      const ctx      = await this.buildSyncContext(warehouseCode, start);
      // Шаг 2: Очистка периода (удаление старых норм операций)
      const deleted = await this.deleteNormsOperationsForPeriod(warehouseCode, start, end);
      this.logger.log(`   🗑️  Удалено старых норм записей: ${deleted}`);

      // Шаг 3 & 4 & 5 & 6: Обработка по чанкам для экономии памяти
      const chunks = this.getDateChunks(start, end, this.CHUNK_DAYS);
      this.logger.log(`   Разбито на ${chunks.length} чанков для последовательной загрузки`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.logger.log(`   --- Чанк ${i + 1}/${chunks.length}: ${chunk.startDate.toISOString().slice(0, 10)} - ${chunk.endDate.toISOString().slice(0, 10)} ---`);
        
        // Fetch — все страницы OData (d.__next)
        const filter = this.buildODataFilter(warehouseCode, chunk.startDate, chunk.endDate);
        const url    = `/WHOSet?${filter}&$format=json`;
        const label  = `Чанк ${i + 1}/${chunks.length} [${warehouseCode}]`;

        const items = await this.fetchAllPages(url, label);

        this.logger.log(`   📡 Получено ${items.length} записей из SAP (все страницы)`);
        if (items.length === 0) continue;

        const dedupMap = new Map<string, OperationRow>();
        const newUsers = new Map<string, { fio: string }>();
        
        const addOp = (row: OperationRow) => {
          const key = `${row.userId}_${row.sapOrderId || 'null'}_${row.operationType}_${row.wcrCode || 'null'}`;
          const existing = dedupMap.get(key);
          if (existing) {
            existing.count += row.count;
            existing.prodCount += row.prodCount;
            existing.amount += row.amount;
            existing.actdura += row.actdura;
            if (row.operationDate > existing.operationDate) {
              existing.operationDate = row.operationDate;
            }
          } else {
            dedupMap.set(key, row);
          }
        };

        for (const item of items) {
          const parsed = this.parseItem(item);
          if (!parsed) continue;

          // ← ключевой фильтр: пропускаем не-нормативные WCR
          if (!normsSet.has(parsed.wcr)) { skipped++; continue; }

          const userId = ctx.userMap.get(parsed.employeeId);
          if (userId === undefined) {
            if (!newUsers.has(parsed.employeeId)) {
              const fio =
                `${parsed.employeeName1} ${parsed.employeeName2}`.trim() ||
                `Сотрудник ${parsed.employeeId}`;
              newUsers.set(parsed.employeeId, { fio });
            }
            continue;
          }

          addOp(this.buildNormsRow(parsed, userId, warehouseCode, ctx));
        }

        // Создаём новых пользователей (если есть) и добавляем их записи
        if (newUsers.size > 0) {
          await this.upsertSapUsers(newUsers, ctx);

          for (const item of items) {
            const parsed = this.parseItem(item);
            if (!parsed || !normsSet.has(parsed.wcr) || !newUsers.has(parsed.employeeId)) continue;
            const userId2 = ctx.userMap.get(parsed.employeeId);
            if (userId2 !== undefined)
              addOp(this.buildNormsRow(parsed, userId2, warehouseCode, ctx));
          }
        }

        const operations = Array.from(dedupMap.values());
        // Удаляем и вставляем заново
        for (let b = 0; b < operations.length; b += this.BATCH_SIZE) {
          await this.bulkInsertNormsOperations(operations.slice(b, b + this.BATCH_SIZE));
          saved += Math.min(this.BATCH_SIZE, operations.length - b);
        }
      }

      this.logger.log(`   ✅ ${warehouseCode}: норм. операций сохранено=${saved}`);
    } catch (err) {
      this.logger.error(`❌ syncNormsWarehouse ${warehouseCode}: ${err.message}`, err.stack);
    }

    return { warehouseCode, saved, skipped };
  }

  /** Строит OperationRow для нормативной записи.
   *  Если WCR не в wcr_mapping — operation_type = wcr_code (amount = 0).
   */
  private buildNormsRow(
    parsed: ParsedOperation,
    userId: number,
    warehouseCode: string,
    ctx: SyncContext,
  ): OperationRow {
    const wcrEntry       = ctx.wcrMap.get(parsed.wcr);
    const operationType  = wcrEntry?.operation_type  ?? parsed.wcr;
    const participantArea = wcrEntry?.participant_area ?? '';
    const tariff         = ctx.tariffMap.get(operationType);
    const amount         = (participantArea === 'Приемка и Хранение' ? parsed.aeiCount : parsed.prodCount) * (tariff?.rate ?? 0);

    return {
      userId,
      warehouseCode,
      operationType,
      participantArea,
      count:         parsed.aeiCount,
      prodCount:     parsed.prodCount,
      actdura:       parsed.actdura,
      operationDate: parsed.operationDate,
      amount,
      sapOrderId:    parsed.sapOrderId,
      wcrCode:       parsed.wcr || null,
      aarea:         parsed.aarea || null,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // ОРКЕСТРАЦИЯ
  // ──────────────────────────────────────────────────────────────

  private async syncAllWarehouses(periodStart: Date, periodEnd: Date): Promise<void> {
    this.logger.log('🔄 Начало синхронизации данных из SAP для всех складов');
    const t0 = Date.now();

    const warehouses = await this.db.query<{ code: string; name: string }>(
      `SELECT code, name FROM warehouses WHERE is_active = 1 ORDER BY code`,
    );
    this.logger.log(`📦 Активных складов: ${warehouses.length}`);

    // Параллельно по WAREHOUSE_CONCURRENCY складов
    for (let i = 0; i < warehouses.length; i += this.WAREHOUSE_CONCURRENCY) {
      const batch = warehouses.slice(i, i + this.WAREHOUSE_CONCURRENCY);
      await Promise.all(
        batch.map((w) =>
          this.syncWarehouse(w.code, periodStart, periodEnd).catch((err) =>
            this.logger.error(`❌ Склад ${w.code}: ${err.message}`, err.stack),
          ),
        ),
      );
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    this.logger.log(`✅ Синхронизация всех складов завершена за ${elapsed}s`);
  }

  /**
   * Синхронизация одного склада:
   * 1. Preload: users + tariffs + wcrMap (3 SELECT, не N+1)
   * 2. Параллельные чанки из SAP API
   * 3. In-memory маппинг (без DB-запросов)
   * 4. Bulk MERGE в БД батчами по BATCH_SIZE
   */
  private async syncWarehouse(
    warehouseCode: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const syncId   = await this.createSyncLog(warehouseCode);
    const t0       = Date.now();
    let totalSaved = 0;

    try {
      this.logger.log(`\n📦 Склад ${warehouseCode}: загрузка контекста...`);

      // Шаг 1: Preload всего необходимого (3 параллельных запроса)
      const ctx = await this.buildSyncContext(warehouseCode, periodStart);
      this.logger.log(
        `   Контекст: ${ctx.userMap.size} юзеров, ` +
        `${ctx.tariffMap.size} тарифов, ${ctx.wcrMap.size} WCR`,
      );

      // Шаг 2: Очистка периода (идемпотентность)
      const deleted = await this.deleteOperationsForPeriod(warehouseCode, periodStart, periodEnd);
      this.logger.log(`   🗑️  Удалено старых записей: ${deleted}`);

      // Шаг 3 & 4 & 5 & 6: Обработка по чанкам для экономии памяти
      const chunks = this.getDateChunks(periodStart, periodEnd, this.CHUNK_DAYS);
      this.logger.log(`   Разбито на ${chunks.length} чанков для последовательной загрузки`);
      
      let skippedNoAei    = 0;
      let skippedNoWcr    = 0;
      let skippedNoTariff = 0;
      const missingTariffs = new Map<string, number>();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.logger.log(`   --- Чанк ${i + 1}/${chunks.length}: ${chunk.startDate.toISOString().slice(0, 10)} - ${chunk.endDate.toISOString().slice(0, 10)} ---`);
        
        // Fetch — все страницы OData (d.__next)
        const filter = this.buildODataFilter(warehouseCode, chunk.startDate, chunk.endDate);
        const url    = `/WHOSet?${filter}&$format=json`;
        const label  = `Чанк ${i + 1}/${chunks.length} [${warehouseCode}]`;

        const items = await this.fetchAllPages(url, label);

        this.logger.log(`   📡 Получено ${items.length} записей (все страницы)`);
        if (items.length === 0) continue;

        // Маппинг и новые юзеры
        const newUsers = new Map<string, { fio: string }>();
        const dedupMap = new Map<string, OperationRow>();

        const addOp = (row: OperationRow) => {
          const key = `${row.userId}_${row.sapOrderId || 'null'}_${row.operationType}_${row.wcrCode || 'null'}`;
          const existing = dedupMap.get(key);
          if (existing) {
            existing.count += row.count;
            existing.prodCount += row.prodCount;
            existing.amount += row.amount;
            existing.actdura += row.actdura;
            if (row.operationDate > existing.operationDate) {
              existing.operationDate = row.operationDate;
            }
          } else {
            dedupMap.set(key, row);
          }
        };

        // ── Единая функция маппинга — НЕ бросает ни одну запись из SAP ──────────
        // Если WCR нет в mapping  → operation_type = сам wcr_code, amount = 0
        // Если нет тарифа         → amount = 0
        // Счётчики для диагностики в лог остаются, но запись всё равно сохраняется
        const buildRow = (parsed: NonNullable<ReturnType<typeof this.parseItem>>, userId: number): OperationRow => {
          const wcrEntry        = ctx.wcrMap.get(parsed.wcr);
          const operationType   = wcrEntry?.operation_type  ?? parsed.wcr;
          const participantArea = wcrEntry?.participant_area ?? '';
          const tariff          = ctx.tariffMap.get(operationType);
          const cnt             = participantArea === 'Приемка и Хранение' ? parsed.aeiCount : parsed.prodCount;
          const amount          = cnt * (tariff?.rate ?? 0);
          return {
            userId, warehouseCode, operationType, participantArea,
            count: parsed.aeiCount, prodCount: parsed.prodCount,
            actdura: parsed.actdura, operationDate: parsed.operationDate,
            amount, sapOrderId: parsed.sapOrderId,
            wcrCode: parsed.wcr || null, aarea: parsed.aarea || null,
          };
        };

        for (const item of items) {
          const parsed = this.parseItem(item);
          if (!parsed) { skippedNoAei++; continue; }

          // Диагностика: считаем неизвестные WCR и тарифы (но НЕ пропускаем)
          const wcrEntry = ctx.wcrMap.get(parsed.wcr);
          if (!wcrEntry) skippedNoWcr++;
          else {
            const tariff = ctx.tariffMap.get(wcrEntry.operation_type);
            if (!tariff) {
              skippedNoTariff++;
              missingTariffs.set(wcrEntry.operation_type, (missingTariffs.get(wcrEntry.operation_type) || 0) + 1);
            }
          }

          const userId = ctx.userMap.get(parsed.employeeId);
          if (userId === undefined) {
            if (!newUsers.has(parsed.employeeId)) {
              const fio = `${parsed.employeeName1} ${parsed.employeeName2}`.trim()
                || `Сотрудник ${parsed.employeeId}`;
              newUsers.set(parsed.employeeId, { fio });
            }
            continue; // вернёмся к этим записям после создания юзера
          }

          addOp(buildRow(parsed, userId));
        }

        // Создаём новых сотрудников и ПОВТОРНО обрабатываем ВСЕ их записи (включая неизвестные WCR)
        if (newUsers.size > 0) {
          await this.upsertSapUsers(newUsers, ctx);

          for (const item of items) {
            const parsed = this.parseItem(item);
            if (!parsed || !newUsers.has(parsed.employeeId)) continue;
            const userId2 = ctx.userMap.get(parsed.employeeId);
            if (userId2 !== undefined) addOp(buildRow(parsed, userId2));
          }
        }

        const operations = Array.from(dedupMap.values());
        this.logger.log(`   💾 Подготовлено к сохранению в чанке: ${operations.length} (уникальных из ${items.length} SAP)`);
        for (let b = 0; b < operations.length; b += this.BATCH_SIZE) {
          const batchSlice = operations.slice(b, b + this.BATCH_SIZE);
          await this.bulkUpsertOperations(batchSlice);
          totalSaved += batchSlice.length;
        }
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.logger.log(
        `✅ Склад ${warehouseCode}: ${totalSaved} сохранено | ` +
        `noAEI=${skippedNoAei} noWCR=${skippedNoWcr} noTariff=${skippedNoTariff} | ${elapsed}s`,
      );
      
      if (missingTariffs.size > 0) {
        this.logger.warn(`   ⚠️  Отсутствующие тарифы для ${warehouseCode}:`);
        Array.from(missingTariffs.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([opType, count]) => {
            this.logger.warn(`      ${opType}: ${count} записей`);
          });
      }
      
      await this.updateSyncLog(syncId, 'success', totalSaved);
    } catch (err) {
      this.logger.error(`❌ Склад ${warehouseCode}: ${err.message}`, err.stack);
      await this.updateSyncLog(syncId, 'failed', totalSaved, err.message);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // PRELOAD КОНТЕКСТ (3 параллельных запроса вместо N+1)
  // ──────────────────────────────────────────────────────────────

  private async buildSyncContext(warehouseCode: string, referenceDate: Date): Promise<SyncContext> {
    const [warehouseRow, users, tariffs, wcrRows] = await Promise.all([
      this.db.queryOne<{ id: number }>(
        `SELECT id FROM warehouses WHERE code = @code`,
        { code: warehouseCode },
      ),
      this.db.query<{ employee_id: string; id: number }>(
        `SELECT id, employee_id FROM users
         WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = @code)`,
        { code: warehouseCode },
      ),
      // Тарифы: warehouse-specific имеет приоритет над ALL
      this.db.query<{ operation_type: string; rate: number; norm_aei_per_hour: number | null }>(
        `SELECT operation_type, rate, norm_aei_per_hour
         FROM tariffs
         WHERE (warehouse_code = @code OR warehouse_code = 'ALL')
           AND is_active = 1
           AND @refDate >= valid_from
           AND (valid_to IS NULL OR @refDate <= valid_to)
         ORDER BY
           CASE WHEN warehouse_code = @code THEN 1 ELSE 2 END,
           valid_from DESC`,
        { code: warehouseCode, refDate: referenceDate },
      ),
      // WCR-маппинг из БД (не hardcode!)
      this.db.query<{ wcr_code: string; operation_type: string; participant_area: string }>(
        `SELECT wcr_code, operation_type, participant_area
         FROM wcr_mapping WHERE is_active = 1`,
      ),
    ]);

    if (!warehouseRow) throw new Error(`Склад не найден в БД: ${warehouseCode}`);

    // Тарифы: первая запись по каждому operation_type (после сортировки — самый приоритетный)
    const tariffMap = new Map<string, { rate: number; norm_aei_per_hour: number | null }>();
    for (const t of tariffs) {
      if (!tariffMap.has(t.operation_type)) {
        tariffMap.set(t.operation_type, { rate: t.rate, norm_aei_per_hour: t.norm_aei_per_hour });
      }
    }

    return {
      warehouseId:  warehouseRow.id,
      warehouseCode,
      userMap:   new Map(users.map((u) => [u.employee_id, u.id])),
      tariffMap,
      wcrMap:    new Map(
        wcrRows.map((r) => [
          r.wcr_code,
          { operation_type: r.operation_type, participant_area: r.participant_area },
        ]),
      ),
    };
  }

  // ──────────────────────────────────────────────────────────────
  // SAP: загрузка одного чанка с поддержкой OData-пагинации
  // ──────────────────────────────────────────────────────────────

  /**
   * Загружает ВСЕ страницы OData для указанного URL.
   * SAP возвращает d.results (текущая страница) и d.__next (URL следующей страницы).
   * Без обхода __next теряются все записи после первой страницы (~1000 строк).
   */
  private async fetchAllPages(initialUrl: string, label: string): Promise<any[]> {
    const all: any[] = [];
    let url: string | null = initialUrl;
    let page = 0;

    while (url) {
      page++;
      const pageUrl = url;
      const items = await this.withRetry(
        async () => {
          const resp = await this.axiosInstance.get(pageUrl, { timeout: 180_000 });
          return resp.data?.d ?? {};
        },
        { label: `${label} стр.${page}`, maxAttempts: 3 },
      );

      const pageItems: any[] = items.results || [];
      for (const item of pageItems) all.push(item);

      // OData v2: следующая страница в d.__next
      const next: string | undefined = items.__next;
      if (next) {
        this.logger.log(`   📄 ${label} стр.${page}: ${pageItems.length} зап., есть следующая страница`);
        // __next может быть абсолютным URL — берём только path+query
        try {
          const parsed = new URL(next);
          url = parsed.pathname + parsed.search;
        } catch {
          url = next; // уже relative
        }
      } else {
        this.logger.log(`   📄 ${label} стр.${page}: ${pageItems.length} зап. (последняя)`);
        url = null;
      }
    }

    return all;
  }

  // ──────────────────────────────────────────────────────────────
  // ПАРСИНГ ЗАПИСИ ИЗ SAP OData
  // ──────────────────────────────────────────────────────────────

  private parseItem(item: any): ParsedOperation | null {
    // ╔══════════════════════════════════════════════════════════════╗
    // ║  Блок 1: Вn = ZsumAmountItm — АЕИ (приёмка, размещение)    ║
    // ║  Блок 2: ZprodWtItm — продуктовые задачи (комплектация)     ║
    // ║  Пропускаем запись только если ОБА равны 0.                  ║
    // ╚══════════════════════════════════════════════════════════════╝
    const aeiCount  = Math.round(parseFloat(item.ZsumAmountItm || '0'));
    const prodCount = Math.round(parseFloat(item.ZprodWtItm   || '0'));
    if (aeiCount <= 0 && prodCount <= 0) return null;

    let employeeId = (item.Employeeid || item.Processor || '').trim();
    // PC-пользователи присылают Employeeid=00000000 — берём CreatedBy.
    // Если это числовой ШК, приводим к формату 8 цифр с ведущими нулями.
    if (/^0+$/.test(employeeId)) {
      const fromCreated = (item.CreatedBy || '').trim();
      if (fromCreated) employeeId = fromCreated;
    }
    if (/^\d+$/.test(employeeId) && employeeId.length < 8) {
      employeeId = employeeId.padStart(8, '0');
    }
    if (!employeeId) return null;

    // Дата из формата /Date(timestamp)/
    let operationDate = new Date();
    if (item.ConfirmedDate) {
      const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
      if (m) operationDate = new Date(parseInt(m[1], 10));
    }

    return {
      employeeId,
      employeeName1: (item.McName1 || '').trim(),
      employeeName2: (item.McName2 || '').trim(),
      warehouseCode: item.Lgnum,
      aeiCount,                                   // Вn = ZsumAmountItm
      prodCount,                                  // ZprodWtItm
      actdura: parseFloat(item.Actdura || '0'),
      operationDate,
      sapOrderId: item.Who || null,
      wcr: (item.Wcr || '').trim(),
      aarea: (item.Aarea || '').trim() || null,
    };
  }

  private async bulkInsertNormsOperations(batch: OperationRow[]): Promise<void> {
    if (batch.length === 0) return;

    const pool = this.db.getPool();
    this.logger.log(`   📦 Batch INSERT norms: ${batch.length} строк`);

    const CHUNK_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      const values = chunk.map((row) => {
        const userId = row.userId;
        const warehouseCode = `N'${(row.warehouseCode || '').replace(/'/g, "''")}'`;
        const operationType = `N'${(row.operationType || '').replace(/'/g, "''")}'`;
        const participantArea = row.participantArea ? `N'${row.participantArea.replace(/'/g, "''")}'` : 'NULL';
        const count = row.count;
        const prodCount = row.prodCount != null ? row.prodCount : 0;
        const actdura = row.actdura != null ? row.actdura : 'NULL';
        const operationDate = `'${row.operationDate.toISOString().slice(0, 19)}'`;
        const amount = row.amount != null ? row.amount : 'NULL';
        const sapOrderId = row.sapOrderId ? `N'${row.sapOrderId.replace(/'/g, "''")}'` : 'NULL';
        const wcrCode = row.wcrCode ? `N'${row.wcrCode.replace(/'/g, "''")}'` : 'NULL';
        const aarea = row.aarea ? `N'${row.aarea.replace(/'/g, "''")}'` : 'NULL';

        return `(${userId}, ${warehouseCode}, ${operationType}, ${participantArea}, ${count}, ${prodCount}, ${actdura}, ${operationDate}, ${amount}, ${sapOrderId}, ${wcrCode}, ${aarea})`;
      }).join(',\n        ');

      await pool.request().query(`
        INSERT INTO norms_operations (user_id, warehouse_code, operation_type, participant_area, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
        VALUES 
        ${values}
      `);

      inserted += chunk.length;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // BULK UPSERT через MSSQL bulk + MERGE (1 round-trip на батч)
  // ──────────────────────────────────────────────────────────────

  private async bulkUpsertOperations(batch: OperationRow[]): Promise<void> {
    if (batch.length === 0) {
      this.logger.log('   ⚠️  Пустой батч — пропускаем bulk insert');
      return;
    }

    const pool = this.db.getPool();
    
    this.logger.log(`   📦 Batch MERGE: ${batch.length} строк`);
    
    // Batch MERGE через VALUES (без временной таблицы)
    // Разбиваем на подбатчи по 100 строк (SQL Server ограничение на VALUES)
    const CHUNK_SIZE = 100;
    let inserted = 0;
    
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      
      // Строим VALUES для MERGE
      const values = chunk.map((row) => {
        const userId = row.userId;
        const warehouseCode = `N'${(row.warehouseCode || '').replace(/'/g, "''")}'`;
        const operationType = `N'${(row.operationType || '').replace(/'/g, "''")}'`;
        const participantArea = row.participantArea ? `N'${row.participantArea.replace(/'/g, "''")}'` : 'NULL';
        const count = row.count;
        const prodCount = row.prodCount != null ? row.prodCount : 0;
        const actdura = row.actdura != null ? row.actdura : 'NULL';
        const operationDate = `'${row.operationDate.toISOString().slice(0, 19)}'`;
        const amount = row.amount != null ? row.amount : 'NULL';
        const sapOrderId = row.sapOrderId ? `N'${row.sapOrderId.replace(/'/g, "''")}'` : 'NULL';
        const wcrCode = row.wcrCode ? `N'${row.wcrCode.replace(/'/g, "''")}'` : 'NULL';
        const aarea = row.aarea ? `N'${row.aarea.replace(/'/g, "''")}'` : 'NULL';

        return `(${userId}, ${warehouseCode}, ${operationType}, ${participantArea}, ${count}, ${prodCount}, ${actdura}, ${operationDate}, ${amount}, ${sapOrderId}, ${wcrCode}, ${aarea})`;
      }).join(',\n        ');

      await pool.request().query(`
        MERGE operations AS target
        USING (
          SELECT * FROM (VALUES
            ${values}
          ) AS source(user_id, warehouse_code, operation_type, participant_area, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
        ) AS source
        ON (
          target.user_id = source.user_id
          AND target.sap_order_id = source.sap_order_id
          AND target.operation_type = source.operation_type
          AND ISNULL(target.wcr_code, '') = ISNULL(source.wcr_code, '')
        )
        WHEN MATCHED THEN
          UPDATE SET
            target.count = source.count,
            target.prod_count = source.prod_count,
            target.amount = source.amount,
            target.actdura = source.actdura,
            target.participant_area = source.participant_area,
            target.wcr_code = source.wcr_code,
            target.aarea = source.aarea,
            target.updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id, warehouse_code, operation_type, participant_area, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
          VALUES (source.user_id, source.warehouse_code, source.operation_type, source.participant_area, source.count, source.prod_count, source.actdura, source.operation_date, source.amount, source.sap_order_id, source.wcr_code, source.aarea);
      `);
      
      inserted += chunk.length;
    }
    
    this.logger.log(`   ✅ Сохранено: ${inserted} операций`);
  }

  // ──────────────────────────────────────────────────────────────
  // СОЗДАНИЕ НОВЫХ ПОЛЬЗОВАТЕЛЕЙ
  // ──────────────────────────────────────────────────────────────

  /** SAP-сотрудники: upsert по employee_id (глобальный UNIQUE), warehouse_id только при INSERT */
  private async upsertSapUsers(
    newUsers: Map<string, { fio: string }>,
    ctx: SyncContext,
  ): Promise<void> {
    this.logger.log(`   👤 Upsert сотрудников (по employee_id): ${newUsers.size}...`);

    for (const [employeeId, { fio }] of newUsers) {
      await this.db.execute(
        `MERGE users AS t
         USING (SELECT @employeeId AS employee_id, @fio AS fio, @warehouseId AS warehouse_id) AS s
         ON t.employee_id = s.employee_id
         WHEN MATCHED THEN
           UPDATE SET t.fio = s.fio, t.is_active = 1, t.warehouse_id = s.warehouse_id
         WHEN NOT MATCHED THEN
           INSERT (employee_id, fio, warehouse_id, role, is_active)
           VALUES (s.employee_id, s.fio, s.warehouse_id, N'employee', 1);`,
        { employeeId, fio, warehouseId: ctx.warehouseId },
      );
    }

    await this.refreshUserMapByEmployeeIds(ctx, [...newUsers.keys()]);
  }

  /** Подставляет id в ctx.userMap для любых складов — нужно после upsert общих SAP-login вроде PI_* */
  private async refreshUserMapByEmployeeIds(
    ctx: SyncContext,
    employeeIds: string[],
  ): Promise<void> {
    if (employeeIds.length === 0) return;

    const pool  = this.db.getPool();
    const req   = pool.request();
    employeeIds.forEach((id, idx) => req.input(`uid${idx}`, sql.NVarChar(64), id));
    const inSql = employeeIds.map((_, idx) => `@uid${idx}`).join(', ');
    const rs    = await req.query<{ id: number; employee_id: string }>(
      `SELECT id, employee_id FROM users WHERE employee_id IN (${inSql})`,
    );

    for (const row of rs.recordset || []) {
      ctx.userMap.set(row.employee_id, row.id);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // RETRY с экспоненциальным backoff
  // ──────────────────────────────────────────────────────────────

  private async withRetry<T>(
    fn: () => Promise<T>,
    opts: { label: string; maxAttempts?: number },
  ): Promise<T> {
    const max = opts.maxAttempts ?? 3;
    let lastErr: any;

    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt === max || !this.isRetryable(err)) throw err;

        // Экспоненциальный backoff: 1s → 2s → 4s (max 30s)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
        this.logger.warn(
          `⚠️  ${opts.label}: ${err.message || err.code} — retry ${attempt}/${max} через ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }

  private isRetryable(err: any): boolean {
    return (
      err?.code === 'ECONNRESET'   ||
      err?.code === 'ETIMEDOUT'    ||
      err?.code === 'ECONNABORTED' ||
      String(err?.message).toLowerCase().includes('aborted') ||
      String(err?.message).toLowerCase().includes('timeout')
    );
  }

  // ──────────────────────────────────────────────────────────────
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ──────────────────────────────────────────────────────────────

  private getDateChunks(start: Date, end: Date, chunkDays: number): DateChunk[] {
    const chunks: DateChunk[] = [];
    let cur = new Date(start.getTime());

    while (cur <= end) {
      const chunkEnd = new Date(cur.getTime());
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
      chunkEnd.setUTCHours(23, 59, 59, 999);
      
      const nextCur = new Date(chunkEnd.getTime() + 1);
      
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());

      chunks.push({ startDate: new Date(cur), endDate: new Date(chunkEnd) });
      
      cur = nextCur;
      cur.setUTCHours(0, 0, 0, 0);
    }

    return chunks;
  }

  private buildODataFilter(warehouseCode: string, startDate: Date, endDate: Date): string {
    const fmt = (d: Date) => d.toISOString().split('.')[0];
    return (
      `$filter=(Lgnum eq '${warehouseCode}'` +
      ` and (ConfirmedDate ge datetime'${fmt(startDate)}'` +
      ` and ConfirmedDate le datetime'${fmt(endDate)}'))`
    );
  }

  private async deleteOperationsForPeriod(
    warehouseCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const start = startDate.toISOString().slice(0, 19).replace('T', ' ');
    const end   = endDate.toISOString().slice(0, 19).replace('T', ' ');
    return this.db.execute(
      `DELETE FROM operations
       WHERE warehouse_code = @warehouseCode
         AND operation_date >= @startDate
         AND operation_date <= @endDate`,
      { warehouseCode, startDate: start, endDate: end },
    );
  }

  private async deleteNormsOperationsForPeriod(
    warehouseCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const start = startDate.toISOString().slice(0, 19).replace('T', ' ');
    const end   = endDate.toISOString().slice(0, 19).replace('T', ' ');
    return this.db.execute(
      `DELETE FROM norms_operations
       WHERE warehouse_code = @warehouseCode
         AND operation_date >= @startDate
         AND operation_date <= @endDate`,
      { warehouseCode, startDate: start, endDate: end },
    );
  }

  private async createSyncLog(warehouseCode: string): Promise<number> {
    const result = await this.db.queryOne<{ id: number }>(
      `INSERT INTO sync_logs (warehouse_code, sync_start, status)
       OUTPUT INSERTED.id
       VALUES (@warehouseCode, GETDATE(), 'running')`,
      { warehouseCode },
    );
    return result!.id;
  }

  private async updateSyncLog(
    id: number,
    status: string,
    recordsProcessed: number,
    errorMessage?: string,
  ): Promise<void> {
    await this.db.execute(
      `UPDATE sync_logs
       SET sync_end          = GETDATE(),
           status            = @status,
           records_processed = @recordsProcessed,
           error_message     = @errorMessage
       WHERE id = @id`,
      { id, status, recordsProcessed, errorMessage: errorMessage ?? null },
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
