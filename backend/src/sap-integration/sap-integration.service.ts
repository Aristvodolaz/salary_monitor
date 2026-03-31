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
  /** Фактическое АЕИ из ZsumAmountItm — ОСНОВНОЙ показатель Вn */
  aeiCount: number;
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
  count: number;       // АЕИ (ZsumAmountItm)
  actdura: number;     // минуты
  operationDate: Date;
  amount: number;      // count * rate = Вn × Рm
  sapOrderId: string | null;
  wcrCode: string | null;   // оригинальный WCR-код из SAP (RPL1/RPL2/PST1/...)
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
  private readonly CHUNK_DAYS          = 5;
  private readonly WAREHOUSE_CONCURRENCY = 3;  // параллельных складов
  private readonly CHUNK_CONCURRENCY   = 3;    // параллельных чанков SAP
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

      // Шаг 3: Параллельная загрузка чанков из SAP
      const chunks   = this.getDateChunks(periodStart, periodEnd, this.CHUNK_DAYS);
      const allItems = await this.fetchChunksParallel(warehouseCode, chunks);
      this.logger.log(`   SAP вернул: ${allItems.length} записей`);
      if (allItems.length > 0) {
        const sample = allItems[0];
        this.logger.log(`   Пример: Employeeid="${sample.Employeeid}" Processor="${sample.Processor}" ZsumAmountItm="${sample.ZsumAmountItm}" Wcr="${sample.Wcr}"`);
      }

      // Шаг 4: Парсинг и маппинг (полностью in-memory, без DB)
      const newUsers    = new Map<string, { fio: string }>();
      const operations: OperationRow[] = [];
      let skippedNoAei    = 0;
      let skippedNoWcr    = 0;
      let skippedNoTariff = 0;
      const missingTariffs = new Map<string, number>();

      const resolveOperation = (item: any): OperationRow | null => {
        const parsed = this.parseItem(item);
        if (!parsed) { skippedNoAei++; return null; }

        const wcrEntry = ctx.wcrMap.get(parsed.wcr);
        if (!wcrEntry) { skippedNoWcr++; return null; }

        const tariff = ctx.tariffMap.get(wcrEntry.operation_type);
        if (!tariff) { skippedNoTariff++; return null; }

        const userId = ctx.userMap.get(parsed.employeeId);
        if (userId === undefined) return null; // новые юзеры обрабатываются отдельно

        // ╔════════════════════════════════════════════════════╗
        // ║  КЛЮЧЕВАЯ ФОРМУЛА:                                ║
        // ║  Вn = ZsumAmountItm  (фактическое АЕИ из WMS)    ║
        // ║  Рm = tariff.rate    (расценка за 1 АЕИ)          ║
        // ║  Сумма = Вn × Рm     (без Ккач — он в Views)     ║
        // ╚════════════════════════════════════════════════════╝
        return {
          userId,
          warehouseCode,
          operationType:   wcrEntry.operation_type,
          participantArea: wcrEntry.participant_area,
          count:  parsed.aeiCount,              // Вn = ZsumAmountItm
          actdura: parsed.actdura,
          operationDate: parsed.operationDate,
          amount: parsed.aeiCount * tariff.rate, // Вn × Рm
          sapOrderId: parsed.sapOrderId,
          wcrCode: parsed.wcr || null,
          aarea: parsed.aarea || null,
        };
      };

      for (const item of allItems) {
        const parsed = this.parseItem(item);
        if (!parsed) { skippedNoAei++; continue; }

        const wcrEntry = ctx.wcrMap.get(parsed.wcr);
        if (!wcrEntry) { skippedNoWcr++; continue; }

        const tariff = ctx.tariffMap.get(wcrEntry.operation_type);
        if (!tariff) {
          skippedNoTariff++;
          missingTariffs.set(wcrEntry.operation_type, (missingTariffs.get(wcrEntry.operation_type) || 0) + 1);
          continue;
        }

        const userId = ctx.userMap.get(parsed.employeeId);
        if (userId === undefined) {
          // Запоминаем нового сотрудника
          if (!newUsers.has(parsed.employeeId)) {
            const fio = `${parsed.employeeName1} ${parsed.employeeName2}`.trim()
              || `Сотрудник ${parsed.employeeId}`;
            newUsers.set(parsed.employeeId, { fio });
          }
          continue;
        }

        operations.push({
          userId,
          warehouseCode,
          operationType:   wcrEntry.operation_type,
          participantArea: wcrEntry.participant_area,
          count:           parsed.aeiCount,
          actdura:         parsed.actdura,
          operationDate:   parsed.operationDate,
          amount:          parsed.aeiCount * tariff.rate,
          sapOrderId:      parsed.sapOrderId,
          wcrCode:         parsed.wcr || null,
          aarea:           parsed.aarea || null,
        });
      }

      // Шаг 5: Создаём новых сотрудников и обрабатываем их записи
      if (newUsers.size > 0) {
        await this.createNewUsers(newUsers, ctx);
        // Перезагружаем userMap
        const freshUsers = await this.db.query<{ employee_id: string; id: number }>(
          `SELECT id, employee_id FROM users WHERE warehouse_id = @wid`,
          { wid: ctx.warehouseId },
        );
        freshUsers.forEach((u) => ctx.userMap.set(u.employee_id, u.id));

        // Обрабатываем записи для только что созданных пользователей
        for (const item of allItems) {
          const parsed = this.parseItem(item);
          if (!parsed || !newUsers.has(parsed.employeeId)) continue;

          const resolved = resolveOperation(item);
          if (resolved) operations.push(resolved);
        }
      }

      // Шаг 6: Bulk-upsert батчами
      this.logger.log(`   💾 Подготовлено операций для сохранения: ${operations.length}`);
      for (let b = 0; b < operations.length; b += this.BATCH_SIZE) {
        const batchSlice = operations.slice(b, b + this.BATCH_SIZE);
        await this.bulkUpsertOperations(batchSlice);
        totalSaved += batchSlice.length;
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

  // ──────────────────────────────────────────────────────────────
  // ПАРСИНГ ЗАПИСИ ИЗ SAP OData
  // ──────────────────────────────────────────────────────────────

  private parseItem(item: any): ParsedOperation | null {
    // ╔══════════════════════════════════════════════════════════════╗
    // ║  Вn = ZsumAmountItm — ФАКТИЧЕСКОЕ АЕИ из WMS               ║
    // ║  Это главный показатель по ТЗ. Используем напрямую.         ║
    // ║  НЕ рассчитываем из Actdura — это было источником ошибки!   ║
    // ╚══════════════════════════════════════════════════════════════╝
    const aeiCount = Math.round(parseFloat(item.ZsumAmountItm || '0'));
    if (aeiCount <= 0) return null;

    const employeeId = (item.Employeeid || item.Processor || '').trim();
    if (!employeeId) return null; // Пропускаем только пустые ID

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
      aeiCount,                                   // Вn = ZsumAmountItm (истинное АЕИ)
      actdura: parseFloat(item.Actdura || '0'),   // для справки/отчётов
      operationDate,
      sapOrderId: item.Who || null,
      wcr: (item.Wcr || '').trim(),
      aarea: (item.Aarea || '').trim() || null,
    };
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
      const values = chunk.map((row, idx) => {
        const userId = row.userId;
        const warehouseCode = `N'${(row.warehouseCode || '').replace(/'/g, "''")}'`;
        const operationType = `N'${(row.operationType || '').replace(/'/g, "''")}'`;
        const participantArea = row.participantArea ? `N'${row.participantArea.replace(/'/g, "''")}'` : 'NULL';
        const count = row.count;
        const actdura = row.actdura != null ? row.actdura : 'NULL';
        const operationDate = `'${row.operationDate.toISOString().slice(0, 19)}'`;
        const amount = row.amount != null ? row.amount : 'NULL';
        const sapOrderId = row.sapOrderId ? `N'${row.sapOrderId.replace(/'/g, "''")}'` : 'NULL';
        const wcrCode = row.wcrCode ? `N'${row.wcrCode.replace(/'/g, "''")}'` : 'NULL';
        const aarea = row.aarea ? `N'${row.aarea.replace(/'/g, "''")}'` : 'NULL';

        return `(${userId}, ${warehouseCode}, ${operationType}, ${participantArea}, ${count}, ${actdura}, ${operationDate}, ${amount}, ${sapOrderId}, ${wcrCode}, ${aarea})`;
      }).join(',\n        ');
      
      await pool.request().query(`
        MERGE operations AS target
        USING (
          SELECT * FROM (VALUES
            ${values}
          ) AS source(user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
        ) AS source
        ON (
          target.user_id = source.user_id
          AND target.sap_order_id = source.sap_order_id
          AND target.operation_type = source.operation_type
        )
        WHEN MATCHED THEN
          UPDATE SET
            target.count = source.count,
            target.amount = source.amount,
            target.actdura = source.actdura,
            target.participant_area = source.participant_area,
            target.wcr_code = source.wcr_code,
            target.aarea = source.aarea,
            target.updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
          VALUES (source.user_id, source.warehouse_code, source.operation_type, source.participant_area, source.count, source.actdura, source.operation_date, source.amount, source.sap_order_id, source.wcr_code, source.aarea);
      `);
      
      inserted += chunk.length;
    }
    
    this.logger.log(`   ✅ Сохранено: ${inserted} операций`);
  }

  // ──────────────────────────────────────────────────────────────
  // СОЗДАНИЕ НОВЫХ ПОЛЬЗОВАТЕЛЕЙ
  // ──────────────────────────────────────────────────────────────

  private async createNewUsers(
    newUsers: Map<string, { fio: string }>,
    ctx: SyncContext,
  ): Promise<void> {
    this.logger.log(`   👤 Создание ${newUsers.size} новых сотрудников...`);

    for (const [employeeId, { fio }] of newUsers) {
      try {
        await this.db.execute(
          `INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
           VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)`,
          { employeeId, fio, warehouseId: ctx.warehouseId },
        );
        this.logger.log(`   ✅ Создан: ${employeeId} (${fio})`);
      } catch (err) {
        // Игнорируем гонку при параллельной обработке складов
        if (!err.message?.includes('UNIQUE') && !err.message?.includes('duplicate')) throw err;
        this.logger.warn(`   ⚠️  Дубликат (параллельный insert): ${employeeId}`);
      }
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
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());

      chunks.push({ startDate: new Date(cur), endDate: new Date(chunkEnd) });
      cur = new Date(chunkEnd.getTime() + 1);
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
