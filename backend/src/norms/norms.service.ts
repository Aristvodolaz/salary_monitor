import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';

export interface WcrNorm {
  id: number;
  wcr_code: string;
  description: string;
  norm_type: string;
  norm_value: number | null;
  is_active: boolean;
}

// ── Справочник комплектации (блок 2 — зарплата: count × rate) ─────────────────

export interface WcrPickingNorm {
  id: number;
  wcr_code: string;
  participant_area: string;
  description_old: string;
  description_new: string;
  picking_type: string;
  norm_label: string;
  rate: number | null;
}

export interface NormsEmployee {
  user_id: number;
  employee_id: string;
  fio: string;
  work_days: number;
  total_aei: number;
  aei_amount: number;
  total_prod: number;
  picking_amount: number;
  /** Упаковка (wcr_picking_norms.picking_type = 'Упаковка') — отдельно от комплектации,
   *  т.к. официальный свод «Выработка комплектация» упаковку не включает. */
  total_packing: number;
  packing_amount: number;
  total_amount: number;
}

export interface PickingStat {
  wcr_code: string;
  participant_area: string;
  description_new: string;
  picking_type: string;
  norm_label: string;
  rate: number | null;
  /** АЕИ комплектации (count) за период — то же поле, что в официальном своде */
  total_prod: number;
  /** Кол-во операций с count > 0 */
  total_operations: number;
  /** Расчётная сумма за период (count × rate) */
  calc_amount: number | null;
}

export interface MarchStat {
  wcr_code: string;
  description: string;
  norm_type: string;
  norm_value: number | null;
  total_aei: number;
  total_operations: number;
  total_actdura_min: number;
  /** Фактическая производительность АЕИ/час (из actdura) */
  actual_aei_per_hour: number | null;
  /** Выполнение норматива, % (null если норматив не задан) */
  norm_pct: number | null;
}

@Injectable()
export class NormsService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /** Справочник нормативов */
  async getAllNorms(): Promise<WcrNorm[]> {
    return this.db.query<WcrNorm>(`
      SELECT id, wcr_code, description, norm_type, norm_value, is_active
      FROM wcr_norms
      WHERE is_active = 1
      ORDER BY norm_type, wcr_code
    `);
  }

  /**
   * Статистика по операциям за указанный период,
   * сгруппированная по WCR-коду и обогащённая нормативами из wcr_norms.
   */
  async getMarchStats(
    startDate: string,
    endDate: string,
    warehouseCode?: string,
  ): Promise<MarchStat[]> {
    const warehouseFilter = warehouseCode
      ? `AND o.warehouse_code = @warehouseCode`
      : '';

    const rows = await this.db.query<{
      wcr_code: string;
      description: string;
      norm_type: string;
      norm_value: number | null;
      total_aei: number;
      total_operations: number;
      total_actdura_min: number;
    }>(
      `
      SELECT
        n.wcr_code,
        n.description,
        n.norm_type,
        n.norm_value,
        ISNULL(SUM(o.count), 0)        AS total_aei,
        ISNULL(COUNT(o.id), 0)         AS total_operations,
        ISNULL(SUM(o.actdura), 0)      AS total_actdura_min
      FROM wcr_norms n
      LEFT JOIN operations o
        ON o.wcr_code = n.wcr_code
        AND o.operation_date >= @startDate
        AND o.operation_date <  DATEADD(DAY, 1, CAST(@endDate AS DATE))
        ${warehouseFilter}
      WHERE n.is_active = 1
      GROUP BY n.wcr_code, n.description, n.norm_type, n.norm_value
      ORDER BY n.norm_type, n.wcr_code
      `,
      {
        startDate,
        endDate,
        ...(warehouseCode ? { warehouseCode } : {}),
      },
    );

    return rows.map((r) => {
      const hours = r.total_actdura_min > 0 ? r.total_actdura_min / 60 : null;
      const actual_aei_per_hour =
        hours !== null && r.total_aei > 0
          ? Math.round((r.total_aei / hours) * 10) / 10
          : null;
      const norm_pct =
        actual_aei_per_hour !== null && r.norm_value !== null && r.norm_value > 0
          ? Math.round((actual_aei_per_hour / r.norm_value) * 1000) / 10
          : null;

      return {
        wcr_code: r.wcr_code,
        description: r.description,
        norm_type: r.norm_type,
        norm_value: r.norm_value,
        total_aei: r.total_aei,
        total_operations: r.total_operations,
        total_actdura_min: r.total_actdura_min,
        actual_aei_per_hour,
        norm_pct,
      };
    });
  }

  // ── Комплектация (блок 2: count × ставка норм) ────────────────────────────────

  /** Справочник нормативов комплектации */
  async getAllPickingNorms(): Promise<WcrPickingNorm[]> {
    return this.db.query<WcrPickingNorm>(`
      SELECT id, wcr_code, participant_area, description_old, description_new,
             picking_type, norm_label, rate
      FROM wcr_picking_norms
      WHERE is_active = 1
      ORDER BY participant_area, picking_type, wcr_code
    `);
  }

  /**
   * Статистика комплектации за период, используя count (АЕИ).
   * Левое JOIN: все коды из wcr_picking_norms, даже если операций не было.
   */
  async getPickingStats(
    startDate: string,
    endDate: string,
    warehouseCode?: string,
  ): Promise<PickingStat[]> {
    const warehouseFilter = warehouseCode
      ? `AND o.warehouse_code = @warehouseCode`
      : '';

    const rows = await this.db.query<{
      wcr_code: string;
      participant_area: string;
      description_new: string;
      picking_type: string;
      norm_label: string;
      rate: number | null;
      total_prod: number;
      total_operations: number;
    }>(
      `
      SELECT
        n.wcr_code,
        n.participant_area,
        n.description_new,
        n.picking_type,
        n.norm_label,
        n.rate,
        ISNULL(SUM(o.count), 0) AS total_prod,
        ISNULL(COUNT(CASE WHEN o.count > 0 THEN 1 END), 0) AS total_operations
      FROM wcr_picking_norms n
      LEFT JOIN operations o
        ON o.wcr_code = n.wcr_code
        AND o.operation_date >= @startDate
        AND o.operation_date <  DATEADD(DAY, 1, CAST(@endDate AS DATE))
        ${warehouseFilter}
      WHERE n.is_active = 1
      GROUP BY n.wcr_code, n.participant_area, n.description_new,
               n.picking_type, n.norm_label, n.rate
      ORDER BY n.participant_area, n.picking_type, n.wcr_code
      `,
      {
        startDate,
        endDate,
        ...(warehouseCode ? { warehouseCode } : {}),
      },
    );

    return rows.map((r) => ({
      ...r,
      calc_amount:
        r.total_prod > 0 && r.rate !== null
          ? Math.round(r.total_prod * r.rate * 100) / 100
          : null,
    }));
  }

  /**
   * Сохранить снимок статистики нормативов за период в таблицу norms_stats_snapshot.
   * Идемпотентно: сначала удаляются строки с тем же периодом и warehouse_code, затем вставляются заново.
   */
  async saveStatsSnapshot(
    startDate: string,
    endDate: string,
    warehouseCode?: string,
  ): Promise<{ deleted: number; inserted: number; period_start: string; period_end: string; warehouse_code: string | null }> {
    const rows = await this.getMarchStats(startDate, endDate, warehouseCode);
    const pool = this.db.getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();
    try {
      const delReq = new sql.Request(transaction);
      delReq.input('period_start', sql.Date, new Date(`${startDate}T12:00:00`));
      delReq.input('period_end', sql.Date, new Date(`${endDate}T12:00:00`));
      delReq.input('warehouse_code', sql.NVarChar(20), warehouseCode ?? null);

      const delResult = await delReq.query(`
        DELETE FROM norms_stats_snapshot
        WHERE period_start = @period_start
          AND period_end = @period_end
          AND (
            (@warehouse_code IS NULL AND warehouse_code IS NULL)
            OR warehouse_code = @warehouse_code
          )
      `);

      const deleted = delResult.rowsAffected[0] ?? 0;

      for (const row of rows) {
        const ins = new sql.Request(transaction);
        ins.input('period_start', sql.Date, new Date(`${startDate}T12:00:00`));
        ins.input('period_end', sql.Date, new Date(`${endDate}T12:00:00`));
        ins.input('warehouse_code', sql.NVarChar(20), warehouseCode ?? null);
        ins.input('wcr_code', sql.NVarChar(50), row.wcr_code);
        ins.input('description', sql.NVarChar(255), row.description);
        ins.input('norm_type', sql.NVarChar(100), row.norm_type);
        ins.input('norm_value', sql.Float, row.norm_value);
        ins.input('total_aei', sql.Int, row.total_aei);
        ins.input('total_operations', sql.Int, row.total_operations);
        ins.input('total_actdura_min', sql.Int, row.total_actdura_min);
        ins.input('actual_aei_per_hour', sql.Float, row.actual_aei_per_hour);
        ins.input('norm_pct', sql.Float, row.norm_pct);

        await ins.query(`
          INSERT INTO norms_stats_snapshot (
            period_start, period_end, warehouse_code,
            wcr_code, description, norm_type, norm_value,
            total_aei, total_operations, total_actdura_min,
            actual_aei_per_hour, norm_pct
          ) VALUES (
            @period_start, @period_end, @warehouse_code,
            @wcr_code, @description, @norm_type, @norm_value,
            @total_aei, @total_operations, @total_actdura_min,
            @actual_aei_per_hour, @norm_pct
          )
        `);
      }

      await transaction.commit();
      this.logger.log(
        `norms_stats_snapshot: period ${startDate}–${endDate}, wh=${warehouseCode ?? 'ALL'}, rows=${rows.length}`,
      );

      return {
        deleted,
        inserted: rows.length,
        period_start: startDate,
        period_end: endDate,
        warehouse_code: warehouseCode ?? null,
      };
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }

  /**
   * Сохранить снимок заработка сотрудников по нормативным операциям.
   * Идемпотентно: сначала удаляются строки с тем же периодом и складом.
   */
  async saveEmployeesSnapshot(
    warehouseId: number,
    startDate: string,
    endDate: string,
  ): Promise<{ deleted: number; inserted: number; period_start: string; period_end: string; warehouse_id: number }> {
    const rows = await this.getNormsEmployees(warehouseId, startDate, endDate);
    const pool = this.db.getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();
    try {
      const delReq = new sql.Request(transaction);
      delReq.input('period_start', sql.Date, new Date(`${startDate}T12:00:00`));
      delReq.input('period_end', sql.Date, new Date(`${endDate}T12:00:00`));
      delReq.input('warehouse_id', sql.Int, warehouseId);

      const delResult = await delReq.query(`
        DELETE FROM norms_employees_snapshot
        WHERE period_start = @period_start
          AND period_end = @period_end
          AND warehouse_id = @warehouse_id
      `);

      const deleted = delResult.rowsAffected[0] ?? 0;

      for (const row of rows) {
        const ins = new sql.Request(transaction);
        ins.input('period_start', sql.Date, new Date(`${startDate}T12:00:00`));
        ins.input('period_end', sql.Date, new Date(`${endDate}T12:00:00`));
        ins.input('warehouse_id', sql.Int, warehouseId);
        ins.input('user_id', sql.Int, row.user_id);
        ins.input('employee_id', sql.NVarChar(50), row.employee_id);
        ins.input('fio', sql.NVarChar(255), row.fio);
        ins.input('work_days', sql.Int, row.work_days);
        ins.input('total_aei', sql.Int, row.total_aei);
        ins.input('aei_amount', sql.Float, row.aei_amount);
        ins.input('total_prod', sql.Int, row.total_prod);
        ins.input('picking_amount', sql.Float, row.picking_amount);
        ins.input('total_packing', sql.Int, row.total_packing ?? 0);
        ins.input('packing_amount', sql.Float, row.packing_amount ?? 0);
        ins.input('total_amount', sql.Float, row.total_amount);

        await ins.query(`
          INSERT INTO norms_employees_snapshot (
            period_start, period_end, warehouse_id, user_id, employee_id, fio,
            work_days, total_aei, aei_amount, total_prod, picking_amount,
            total_packing, packing_amount, total_amount
          ) VALUES (
            @period_start, @period_end, @warehouse_id, @user_id, @employee_id, @fio,
            @work_days, @total_aei, @aei_amount, @total_prod, @picking_amount,
            @total_packing, @packing_amount, @total_amount
          )
        `);
      }

      await transaction.commit();
      this.logger.log(
        `norms_employees_snapshot: period ${startDate}–${endDate}, warehouseId=${warehouseId}, rows=${rows.length}`,
      );

      return {
        deleted,
        inserted: rows.length,
        period_start: startDate,
        period_end: endDate,
        warehouse_id: warehouseId,
      };
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }

  // ── Сотрудники: заработок по нормативным операциям ────────────────────────────

  /**
   * Список сотрудников с заработком по операциям из wcr_norms и wcr_picking_norms.
   * АЕИ приёмки, комплектация и упаковка показаны отдельно.
   *
   * Упаковка (wcr_picking_norms.picking_type = 'Упаковка': DEF/DEFF/PKM2/PKM3/PKM4/PKM5/PKMC)
   * исключена из "Комплектация" — официальный свод «Выработка комплектация» её не включает
   * (сверка с эталонными файлами за июнь-август 2026 показала расхождение ~35%, полностью
   * объяснявшееся именно этим — см. обсуждение). Деньги за упаковку никуда не делись,
   * просто считаются отдельной строкой, как и в эталоне.
   */
  async getNormsEmployees(
    warehouseId: number,
    startDate: string,
    endDate: string,
  ): Promise<any[]> {
    return this.db.query(
      `
      SELECT
        u.id                                                     AS user_id,
        u.employee_id,
        u.fio,
        COUNT(DISTINCT CAST(o.operation_date AS DATE))          AS work_days,
        -- Блок 1: АЕИ (wcr_norms)
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.count ELSE 0 END), 0)
                                                                 AS total_aei,
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0)
                                                                 AS aei_amount,
        -- Блок 2: Комплектация (wcr_picking_norms, picking_type <> 'Упаковка') — count × rate
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type <> N'Упаковка' THEN ISNULL(o.count, 0) ELSE 0 END), 0)
                                                                 AS total_prod,
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type <> N'Упаковка' AND wp.rate IS NOT NULL
                        THEN ISNULL(o.count, 0) * wp.rate ELSE 0 END), 0)
                                                                 AS picking_amount,
        -- Блок 3: Упаковка (wcr_picking_norms, picking_type = 'Упаковка') — count × rate
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type = N'Упаковка' THEN ISNULL(o.count, 0) ELSE 0 END), 0)
                                                                 AS total_packing,
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.picking_type = N'Упаковка' AND wp.rate IS NOT NULL
                        THEN ISNULL(o.count, 0) * wp.rate ELSE 0 END), 0)
                                                                 AS packing_amount,
        -- Итого (не изменилось — сумма всех трёх блоков)
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NOT NULL
                        THEN ISNULL(o.count, 0) * wp.rate ELSE 0 END), 0)
                                                                 AS total_amount
      FROM operations o
      INNER JOIN users u       ON o.user_id = u.id
      LEFT  JOIN wcr_norms wn  ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      LEFT  JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
      WHERE u.warehouse_id = @warehouseId
        AND u.is_active = 1
        AND u.employee_id != '00000000'
        AND o.operation_date >= @startDate
        AND o.operation_date <  DATEADD(DAY, 1, CAST(@endDate AS DATE))
        AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)
      GROUP BY u.id, u.employee_id, u.fio
      ORDER BY total_amount DESC
      `,
      { warehouseId, startDate, endDate },
    );
  }

  /**
   * Детализация по сотруднику: АЕИ-операции и picking-операции — отдельно.
   */
  async getNormsEmployeeDetail(
    employeeId: number,
    warehouseId: number,
    startDate: string,
    endDate: string,
  ): Promise<{ aei: any[]; picking: any[] }> {
    const [aei, picking] = await Promise.all([
      // АЕИ-блок: группировка по WCR-коду
      this.db.query(
        `
        SELECT
          o.wcr_code,
          wn.description,
          wn.norm_type,
          SUM(o.count)       AS total_aei,
          SUM(o.amount)      AS total_amount,
          COUNT(*)           AS operations_count,
          MIN(o.operation_date) AS first_date,
          MAX(o.operation_date) AS last_date
        FROM operations o
        INNER JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
        INNER JOIN users u ON o.user_id = u.id
        WHERE u.id = @employeeId
          AND u.warehouse_id = @warehouseId
          AND o.operation_date >= @startDate
          AND o.operation_date <  DATEADD(DAY, 1, CAST(@endDate AS DATE))
        GROUP BY o.wcr_code, wn.description, wn.norm_type
        ORDER BY total_amount DESC
        `,
        { employeeId, warehouseId, startDate, endDate },
      ),
      // Picking-блок: группировка по WCR-коду
      this.db.query(
        `
        SELECT
          o.wcr_code,
          wp.description_new   AS description,
          wp.participant_area,
          wp.picking_type,
          wp.rate,
          SUM(ISNULL(o.count, 0))  AS total_prod,
          SUM(ISNULL(o.count, 0) * ISNULL(wp.rate, 0)) AS total_amount,
          COUNT(*)                       AS operations_count,
          MIN(o.operation_date)          AS first_date,
          MAX(o.operation_date)          AS last_date
        FROM operations o
        INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
        INNER JOIN users u ON o.user_id = u.id
        WHERE u.id = @employeeId
          AND u.warehouse_id = @warehouseId
          AND o.operation_date >= @startDate
          AND o.operation_date <  DATEADD(DAY, 1, CAST(@endDate AS DATE))
          AND ISNULL(o.count, 0) > 0
        GROUP BY o.wcr_code, wp.description_new, wp.participant_area, wp.picking_type, wp.rate
        ORDER BY total_amount DESC
        `,
        { employeeId, warehouseId, startDate, endDate },
      ),
    ]);

    return { aei, picking };
  }
}
