import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';
import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';

// ────────────────────────────────────────────────────────────────
// Типы
// ────────────────────────────────────────────────────────────────

interface SyncContext {
  warehouseId: number;
  warehouseCode: string;
  /** ключи: personnel_number / ШК / нормализованный id → user DB id */
  userMap: Map<string, number>;
  /** Rsrc (верхний регистр) → user DB id */
  rsrcUserMap: Map<string, number>;
  /** operation_type → tariff */
  tariffMap: Map<string, { rate: number; norm_aei_per_hour: number | null }>;
  /** wcr_code → { operation_type, participant_area } */
  wcrMap: Map<string, { operation_type: string; participant_area: string }>;
  /** wcr_code → norm_type (справочник wcr_norms — блок 1/АЕИ, без тарифа) */
  wcrNormsMap: Map<string, { normType: string }>;
  /** wcr в wcr_picking_norms → комплектация: amount = count × rate */
  pickingNormMap: Map<string, number | null>;
}

interface ParsedOperation {
  employeeId: string;
  processor: string;
  employeeName1: string;
  employeeName2: string;
  warehouseCode: string;
  /** Фактическое АЕИ из ZsumAmountItm — в ЗП (и комплектация, и сортировка) */
  aeiCount: number;
  /** SAP ZprodWtItm — сохраняем в prod_count, в деньги не идёт */
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
  count: number;       // АЕИ (ZsumAmountItm) — в ЗП идёт это поле
  prodCount: number;   // SAP ZprodWtItm — храним, в деньги не идёт
  actdura: number;     // минуты
  operationDate: Date;
  amount: number;      // picking: АЕИ×ставка норм; mapped: АЕИ×тариф; иначе 0
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

interface SapEmployeeRow {
  lgnum: string;
  rsrc: string;
  personnel_number: string;
  employee_name: string;
  jobgr: string;
  jobgr_text: string;
}

const DEFAULT_EMPLOYEE_ODATA_URL =
  'http://pwm.komus.net/sap/opu/odata4/sap/z_employee/srvd_a2x/sap/z_employee/0001/Employee';

@Injectable()
export class SapIntegrationService {
  private axiosInstance: AxiosInstance;
  private employeeAxios: AxiosInstance;
  private employeeODataUrl: string;
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

    this.employeeODataUrl =
      this.configService.get<string>('SAP_EMPLOYEE_ODATA_URL') || DEFAULT_EMPLOYEE_ODATA_URL;
    this.employeeAxios = axios.create({
      auth: { username: sapUser, password: sapPass },
      timeout: 120_000,
      proxy: false,
      headers: { Accept: 'application/json' },
      httpAgent:  new http.Agent({ keepAlive: true, maxSockets: 5 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 5 }),
      validateStatus: (status) => status < 500,
    });
    this.logger.log(`SAP employees URL: ${this.employeeODataUrl}`);
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
   * Полная выгрузка справочника сотрудников из z_employee (OData4) + upsert users.
   */
  async syncEmployees(): Promise<{ fetched: number; upserted: number }> {
    const markRow = await this.db.queryOne<{ mark: Date }>(`SELECT GETDATE() AS mark`);
    const syncStart = markRow!.mark;
    this.logger.log('👥 Синхронизация справочника сотрудников z_employee');

    const fetchedRaw = await this.fetchAllSapEmployees();
    const fetched = this.dedupeEmployees(fetchedRaw);
    this.logger.log(
      `   Получено из SAP: ${fetchedRaw.length}, уникальных (склад+табельный): ${fetched.length}`,
    );

    const upserted = await this.upsertSapEmployees(fetched, syncStart);
    await this.deactivateMissingEmployees(syncStart);
    await this.upsertUsersFromEmployees();

    this.logger.log(`✅ Справочник сотрудников обновлён: upsert=${upserted}`);
    return { fetched: fetched.length, upserted };
  }

  /**
   * Удаляет операции за последние 3 календарных месяца и загружает их заново
   * уже с привязкой через sap_employees.
   */
  async reloadLast3Months(): Promise<void> {
    const now   = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    this.logger.log(
      `♻️  Полная перезагрузка ${start.toISOString().slice(0, 10)} — ${end.toISOString().slice(0, 10)}`,
    );
    await this.syncEmployees();
    await this.syncAllWarehouses(start, end);
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
        
        // Fetch
        const filter = this.buildODataFilter(warehouseCode, chunk.startDate, chunk.endDate);
        const url    = `/WHOSet?${filter}&$format=json`;
        const label  = `Чанк ${i + 1}/${chunks.length} [${warehouseCode}]`;
        
        const items = await this.withRetry(
          async () => {
            const resp  = await this.axiosInstance.get(url, { timeout: 180_000 });
            return resp.data?.d?.results || [];
          },
          { label, maxAttempts: 3 },
        );
        
        this.logger.log(`   📡 Получено ${items.length} записей из SAP`);
        if (items.length === 0) continue;

        const operations: OperationRow[] = [];

        for (const item of items) {
          const parsed = this.parseItem(item);
          if (!parsed) continue;

          if (!normsSet.has(parsed.wcr)) { skipped++; continue; }

          const userId = this.resolveUserId(ctx, parsed);
          if (userId === undefined) { skipped++; continue; }

          operations.push(this.buildNormsRow(parsed, userId, warehouseCode, ctx));
        }

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
   *  Unmapped: operation_type = wcr_code; amount = picking rate если код в нормах комплектации, иначе 0.
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
    const tariff         = wcrEntry ? ctx.tariffMap.get(operationType) : undefined;
    const amount         = this.resolveAmount(parsed, ctx, tariff?.rate);

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
        `   Контекст: ${ctx.userMap.size} ключей сотрудников, ` +
        `${ctx.tariffMap.size} тарифов, ${ctx.wcrMap.size} WCR`,
      );

      // Чанки считаем заранее: сначала проверка SAP, потом DELETE.
      const chunks = this.getDateChunks(periodStart, periodEnd, this.CHUNK_DAYS);
      this.logger.log(`   Разбито на ${chunks.length} чанков для последовательной загрузки`);

      // Не стираем период, пока SAP не ответил на первый день.
      if (chunks.length > 0) {
        const probe = chunks[0];
        const probeFilter = this.buildODataFilter(warehouseCode, probe.startDate, probe.endDate);
        const probeUrl = `/WHOSet?${probeFilter}&$format=json`;
        await this.withRetry(
          async () => {
            const resp = await this.axiosInstance.get(probeUrl, { timeout: 180_000 });
            if (resp.status >= 400) {
              throw new Error(`SAP probe HTTP ${resp.status}`);
            }
            return resp.data?.d?.results || [];
          },
          { label: `probe SAP [${warehouseCode}]`, maxAttempts: 3 },
        );
        this.logger.log(`   SAP доступен — очищаем период и грузим заново`);
      }

      const deleted = await this.deleteOperationsForPeriod(warehouseCode, periodStart, periodEnd);
      this.logger.log(`   🗑️  Удалено старых записей: ${deleted}`);
      
      let skippedNoAei    = 0;
      let skippedNoWcr    = 0;
      let skippedNoTariff = 0;
      let skippedNoEmployee = 0;
      let savedAeiFallback = 0;
      const missingTariffs = new Map<string, number>();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.logger.log(`   --- Чанк ${i + 1}/${chunks.length}: ${chunk.startDate.toISOString().slice(0, 10)} - ${chunk.endDate.toISOString().slice(0, 10)} ---`);
        
        // Fetch
        const filter = this.buildODataFilter(warehouseCode, chunk.startDate, chunk.endDate);
        const url    = `/WHOSet?${filter}&$format=json`;
        const label  = `Чанк ${i + 1}/${chunks.length} [${warehouseCode}]`;
        
        const items = await this.withRetry(
          async () => {
            const resp  = await this.axiosInstance.get(url, { timeout: 180_000 });
            return resp.data?.d?.results || [];
          },
          { label, maxAttempts: 3 },
        );
        
        this.logger.log(`   📡 Получено ${items.length} записей`);
        if (items.length === 0) continue;

        // Привязка только через sap_employees (табельный / Rsrc), без создания users из WHOSet
        const operations: OperationRow[] = [];

        for (const item of items) {
          const parsed = this.parseItem(item);
          if (!parsed) { skippedNoAei++; continue; }

          const userId = this.resolveUserId(ctx, parsed);
          if (userId === undefined) { skippedNoEmployee++; continue; }

          const wcrEntry = ctx.wcrMap.get(parsed.wcr);
          let operationType: string;
          let participantArea: string;
          let amount: number;

          if (wcrEntry) {
            const tariff = ctx.tariffMap.get(wcrEntry.operation_type);
            const isPicking = ctx.pickingNormMap.has(parsed.wcr);
            // Комплектация живёт на ставке норм, тариф не обязателен.
            if (!tariff && !isPicking) {
              skippedNoTariff++;
              missingTariffs.set(wcrEntry.operation_type, (missingTariffs.get(wcrEntry.operation_type) || 0) + 1);
              continue;
            }
            operationType   = wcrEntry.operation_type;
            participantArea = wcrEntry.participant_area;
            amount = this.resolveAmount(parsed, ctx, tariff?.rate);
          } else {
            // Unmapped: как раньше — сохраняем только коды из wcr_norms.
            // Тариф не подставляем: иначе RPL (и любой unmapped) снова получит 5.9.
            const normEntry = ctx.wcrNormsMap.get(parsed.wcr);
            if (!normEntry) { skippedNoWcr++; continue; }
            operationType   = normEntry.normType;
            participantArea = 'АЕИ';
            amount = this.resolveAmount(parsed, ctx);
            savedAeiFallback++;
          }

          operations.push({
            userId,
            warehouseCode,
            operationType,
            participantArea,
            count:           parsed.aeiCount,
            prodCount:       parsed.prodCount,
            actdura:         parsed.actdura,
            operationDate:   parsed.operationDate,
            amount,
            sapOrderId:      parsed.sapOrderId,
            wcrCode:         parsed.wcr || null,
            aarea:           parsed.aarea || null,
          });
        }

        this.logger.log(`   💾 Подготовлено к сохранению в чанке: ${operations.length}`);
        for (let b = 0; b < operations.length; b += this.BATCH_SIZE) {
          const batchSlice = operations.slice(b, b + this.BATCH_SIZE);
          await this.bulkUpsertOperations(batchSlice);
          totalSaved += batchSlice.length;
        }
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.logger.log(
        `✅ Склад ${warehouseCode}: ${totalSaved} сохранено | ` +
        `noAEI=${skippedNoAei} noWCR=${skippedNoWcr} noTariff=${skippedNoTariff} noEmp=${skippedNoEmployee} aeiFallback=${savedAeiFallback} | ${elapsed}s`,
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
    const [warehouseRow, users, employees, tariffs, wcrRows, wcrNormsRows, pickingRows] = await Promise.all([
      this.db.queryOne<{ id: number }>(
        `SELECT id FROM warehouses WHERE code = @code`,
        { code: warehouseCode },
      ),
      this.db.query<{ employee_id: string; id: number }>(
        `SELECT id, employee_id FROM users`,
      ),
      this.db.query<{ personnel_number: string; rsrc: string; lgnum: string }>(
        `SELECT personnel_number, rsrc, lgnum
         FROM sap_employees
         WHERE is_active = 1`,
      ),
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
      this.db.query<{ wcr_code: string; operation_type: string; participant_area: string }>(
        `SELECT wcr_code, operation_type, participant_area
         FROM wcr_mapping WHERE is_active = 1`,
      ),
      this.db.query<{ wcr_code: string; norm_type: string }>(
        `SELECT wcr_code, norm_type FROM wcr_norms WHERE is_active = 1`,
      ),
      this.db.query<{ wcr_code: string; rate: number | null }>(
        `SELECT wcr_code, rate FROM wcr_picking_norms WHERE is_active = 1`,
      ),
    ]);

    if (!warehouseRow) throw new Error(`Склад не найден в БД: ${warehouseCode}`);

    const tariffMap = new Map<string, { rate: number; norm_aei_per_hour: number | null }>();
    for (const t of tariffs) {
      if (!tariffMap.has(t.operation_type)) {
        tariffMap.set(t.operation_type, { rate: t.rate, norm_aei_per_hour: t.norm_aei_per_hour });
      }
    }

    const usersByNorm = new Map<string, number>();
    for (const u of users) {
      this.addLookupKeys(usersByNorm, u.employee_id, u.id);
    }

    const userMap = new Map<string, number>();
    const rsrcUserMap = new Map<string, number>();
    for (const emp of employees) {
      const userId = usersByNorm.get(this.normalizeId(emp.personnel_number));
      if (userId === undefined) continue;
      this.addLookupKeys(userMap, emp.personnel_number, userId);
      if (emp.rsrc && emp.lgnum === warehouseCode) {
        rsrcUserMap.set(emp.rsrc.trim().toUpperCase(), userId);
      }
    }

    this.logger.log(
      `   Справочник: ${employees.length} sap_employees, сопоставлено userMap=${userMap.size} rsrc=${rsrcUserMap.size}`,
    );

    return {
      warehouseId:  warehouseRow.id,
      warehouseCode,
      userMap,
      rsrcUserMap,
      tariffMap,
      wcrMap:    new Map(
        wcrRows.map((r) => [
          r.wcr_code,
          { operation_type: r.operation_type, participant_area: r.participant_area },
        ]),
      ),
      wcrNormsMap: new Map(
        wcrNormsRows.map((r) => [r.wcr_code, { normType: r.norm_type }]),
      ),
      pickingNormMap: new Map(pickingRows.map((p) => [p.wcr_code, p.rate])),
    };
  }

  // ──────────────────────────────────────────────────────────────
  // SAP: параллельная загрузка чанков
  // ──────────────────────────────────────────────────────────────

  private async fetchChunksParallel(warehouseCode: string, chunks: DateChunk[]): Promise<any[]> {
    const results: any[] = [];

    for (let i = 0; i < chunks.length; i += this.CHUNK_CONCURRENCY) {
      const batch = chunks.slice(i, i + this.CHUNK_CONCURRENCY);
      const batchData = await Promise.all(
        batch.map((chunk, j) =>
          this.fetchChunkWithRetry(warehouseCode, chunk, i + j, chunks.length),
        ),
      );
      // Избегаем spread для больших массивов (переполнение стека)
      for (const items of batchData) {
        for (const item of items) results.push(item);
      }
    }

    return results;
  }

  private async fetchChunkWithRetry(
    warehouseCode: string,
    chunk: DateChunk,
    idx: number,
    total: number,
  ): Promise<any[]> {
    const filter = this.buildODataFilter(warehouseCode, chunk.startDate, chunk.endDate);
    const url    = `/WHOSet?${filter}&$format=json`;
    const label  = `Окно ${idx + 1}/${total} [${warehouseCode}] ` +
                   `${chunk.startDate.toISOString().slice(0, 10)}`;

    return this.withRetry(
      async () => {
        this.logger.log(`   🔗 Запрос: ${this.axiosInstance.defaults.baseURL}${url}`);
        const resp  = await this.axiosInstance.get(url, { timeout: 180_000 });
        const items = resp.data?.d?.results || [];
        this.logger.log(`   📡 ${label} → ${items.length} записей`);
        return items;
      },
      { label, maxAttempts: 3 },
    );
  }

  /**
   * Одна формула с v_salary_details / migration 017:
   * комплектация (wcr_picking_norms): АЕИ × ставка норм;
   * иначе только если WCR в wcr_mapping: АЕИ × тариф;
   * иначе (unmapped, в т.ч. RPL1/2/3/5): 0.
   * prod_count в деньги не идёт.
   */
  private resolveAmount(parsed: ParsedOperation, ctx: SyncContext, tariffRate?: number): number {
    if (ctx.pickingNormMap.has(parsed.wcr)) {
      return parsed.aeiCount * (ctx.pickingNormMap.get(parsed.wcr) ?? 0);
    }
    if (!ctx.wcrMap.has(parsed.wcr)) {
      return 0;
    }
    return parsed.aeiCount * (tariffRate ?? 0);
  }

  // ──────────────────────────────────────────────────────────────
  // ПАРСИНГ ЗАПИСИ ИЗ SAP OData
  // ──────────────────────────────────────────────────────────────

  private parseItem(item: any): ParsedOperation | null {
    // ╔══════════════════════════════════════════════════════════════╗
    // ║  ЗП: ZsumAmountItm (АЕИ). ZprodWtItm только храним.         ║
    // ║  Пропускаем запись только если ОБА равны 0.                  ║
    // ╚══════════════════════════════════════════════════════════════╝
    const aeiCount  = Math.round(parseFloat(item.ZsumAmountItm || '0'));
    const prodCount = Math.round(parseFloat(item.ZprodWtItm   || '0'));
    if (aeiCount <= 0 && prodCount <= 0) return null;

    const employeeId = (item.Employeeid || '').trim();
    const processor  = (item.Processor || '').trim();
    if (!employeeId && !processor) return null;

    // Дата из формата /Date(timestamp)/
    let operationDate = new Date();
    if (item.ConfirmedDate) {
      const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
      if (m) operationDate = new Date(parseInt(m[1], 10));
    }

    return {
      employeeId: employeeId || processor,
      processor,
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
  // СПРАВОЧНИК СОТРУДНИКОВ (z_employee OData4)
  // ──────────────────────────────────────────────────────────────

  /** Ищет user_id в sap_employees: табельный номер, затем Rsrc. */
  private resolveUserId(ctx: SyncContext, parsed: ParsedOperation): number | undefined {
    for (const raw of [parsed.employeeId, parsed.processor]) {
      if (!raw) continue;
      const direct = ctx.userMap.get(raw);
      if (direct !== undefined) return direct;
      const norm = ctx.userMap.get(this.normalizeId(raw));
      if (norm !== undefined) return norm;
      const padded = ctx.userMap.get(this.padEmployeeId(raw));
      if (padded !== undefined) return padded;
    }
    if (parsed.processor) {
      const byRsrc = ctx.rsrcUserMap.get(parsed.processor.toUpperCase());
      if (byRsrc !== undefined) return byRsrc;
    }
    return undefined;
  }

  private normalizeId(raw: string): string {
    const s = (raw || '').trim();
    if (!s) return '';
    const stripped = s.replace(/^0+/, '');
    return stripped === '' ? '0' : stripped;
  }

  private padEmployeeId(raw: string): string {
    return this.normalizeId(raw).padStart(8, '0');
  }

  private addLookupKeys(map: Map<string, number>, raw: string, userId: number): void {
    const trimmed = (raw || '').trim();
    if (!trimmed) return;
    map.set(trimmed, userId);
    map.set(this.normalizeId(trimmed), userId);
    map.set(this.padEmployeeId(trimmed), userId);
  }

  private async fetchAllSapEmployees(): Promise<SapEmployeeRow[]> {
    const origin = new URL(this.employeeODataUrl).origin;
    let nextUrl: string | null = `${this.employeeODataUrl}?sap-statistics=true`;
    const rows: SapEmployeeRow[] = [];
    let page = 0;

    while (nextUrl) {
      page += 1;
      const url = nextUrl;
      const items = await this.withRetry(
        async () => {
          const resp = await this.employeeAxios.get(url, { timeout: 180_000 });
          if (resp.status >= 400) {
            throw new Error(`z_employee HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 300)}`);
          }
          const list = resp.data?.value;
          if (!Array.isArray(list)) {
            throw new Error('z_employee: в ответе нет value[]');
          }
          const link = resp.data?.['@odata.nextLink'] as string | undefined;
          return { list, link };
        },
        { label: `z_employee page ${page}`, maxAttempts: 3 },
      );

      for (const item of items.list) {
        const personnelNumber = String(item.PersonnelNumber || '').trim();
        const lgnum = String(item.Lgnum || '').trim();
        if (!personnelNumber || !lgnum) continue;
        rows.push({
          lgnum,
          rsrc: String(item.Rsrc || '').trim(),
          personnel_number: personnelNumber,
          employee_name: String(item.EmployeeName || '').trim() || `Сотрудник ${personnelNumber}`,
          jobgr: String(item.Jobgr || '').trim(),
          jobgr_text: String(item.JobgrText || '').trim(),
        });
      }

      this.logger.log(`   страница ${page}: +${items.list.length}, всего ${rows.length}`);
      if (!items.link) {
        nextUrl = null;
      } else if (items.link.startsWith('http')) {
        nextUrl = items.link;
      } else {
        nextUrl = origin + items.link;
      }
    }

    return rows;
  }

  /** SAP может отдать одного человека дважды (разный Rsrc) — MERGE так нельзя. */
  private dedupeEmployees(rows: SapEmployeeRow[]): SapEmployeeRow[] {
    const map = new Map<string, SapEmployeeRow>();
    for (const row of rows) {
      map.set(`${row.lgnum}|${row.personnel_number}`, row);
    }
    return [...map.values()];
  }

  private async upsertSapEmployees(rows: SapEmployeeRow[], _syncStart: Date): Promise<number> {
    const unique = this.dedupeEmployees(rows);
    if (unique.length === 0) return 0;

    const pool = this.db.getPool();
    const CHUNK = 80;
    let upserted = 0;

    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const values = chunk.map((r) => {
        const lgnum = `N'${r.lgnum.replace(/'/g, "''")}'`;
        const rsrc = `N'${r.rsrc.replace(/'/g, "''")}'`;
        const pers = `N'${r.personnel_number.replace(/'/g, "''")}'`;
        const name = `N'${r.employee_name.replace(/'/g, "''")}'`;
        const jobgr = `N'${r.jobgr.replace(/'/g, "''")}'`;
        const jobgrText = `N'${r.jobgr_text.replace(/'/g, "''")}'`;
        return `(${lgnum}, ${rsrc}, ${pers}, ${name}, ${jobgr}, ${jobgrText})`;
      }).join(',\n        ');

      await pool.request().query(`
        MERGE sap_employees AS target
        USING (
          SELECT * FROM (VALUES
            ${values}
          ) AS source(lgnum, rsrc, personnel_number, employee_name, jobgr, jobgr_text)
        ) AS source
        ON target.lgnum = source.lgnum AND target.personnel_number = source.personnel_number
        WHEN MATCHED THEN
          UPDATE SET
            target.rsrc = source.rsrc,
            target.employee_name = source.employee_name,
            target.jobgr = source.jobgr,
            target.jobgr_text = source.jobgr_text,
            target.is_active = 1,
            target.synced_at = GETDATE(),
            target.updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (lgnum, rsrc, personnel_number, employee_name, jobgr, jobgr_text, is_active, synced_at)
          VALUES (source.lgnum, source.rsrc, source.personnel_number, source.employee_name, source.jobgr, source.jobgr_text, 1, GETDATE());
      `);
      upserted += chunk.length;
    }

    return upserted;
  }

  private async deactivateMissingEmployees(syncStart: Date): Promise<void> {
    await this.db.execute(
      `UPDATE sap_employees
       SET is_active = 0, updated_at = GETDATE()
       WHERE synced_at < @syncStart AND is_active = 1`,
      { syncStart },
    );
  }

  /** Создаёт/обновляет users из справочника: employee_id = табельный с ведущими нулями. */
  private async upsertUsersFromEmployees(): Promise<void> {
    const employees = await this.db.query<{
      lgnum: string;
      personnel_number: string;
      employee_name: string;
    }>(
      `SELECT lgnum, personnel_number, employee_name
       FROM sap_employees WHERE is_active = 1`,
    );
    const warehouses = await this.db.query<{ id: number; code: string }>(
      `SELECT id, code FROM warehouses`,
    );
    const warehouseByCode = new Map(warehouses.map((w) => [w.code, w.id]));
    const users = await this.db.query<{ id: number; employee_id: string }>(
      `SELECT id, employee_id FROM users`,
    );
    const userByNorm = new Map<string, { id: number; employee_id: string }>();
    for (const u of users) {
      userByNorm.set(this.normalizeId(u.employee_id), u);
    }

    let created = 0;
    let updated = 0;

    for (const emp of employees) {
      const warehouseId = warehouseByCode.get(emp.lgnum);
      if (!warehouseId) continue;

      const employeeId = this.padEmployeeId(emp.personnel_number);
      const existing = userByNorm.get(this.normalizeId(emp.personnel_number));

      if (existing) {
        await this.db.execute(
          `UPDATE users SET fio = @fio, updated_at = GETDATE() WHERE id = @id`,
          { fio: emp.employee_name, id: existing.id },
        );
        updated += 1;
      } else {
        try {
          await this.db.execute(
            `INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
             VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)`,
            { employeeId, fio: emp.employee_name, warehouseId },
          );
          userByNorm.set(this.normalizeId(emp.personnel_number), { id: 0, employee_id: employeeId });
          created += 1;
        } catch (err) {
          if (!err.message?.includes('UNIQUE') && !err.message?.includes('duplicate')) throw err;
        }
      }
    }

    this.logger.log(`   users: создано=${created}, обновлено ФИО=${updated}`);
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
