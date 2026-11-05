import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';

export interface WarehouseRateRow {
  wcr_code: string;
  description: string;
  area: string;
  picking_type: string | null;
  /** Ставка по умолчанию (общая для всех складов), null — не задана */
  default_rate: number | null;
  /** Текущая индивидуальная ставка этого склада, null — используется общая */
  custom_rate: number | null;
  custom_from: string | null;
}

export interface SetRateResult {
  warehouse_code: string;
  wcr_code: string;
  rate: number | null;
  effective_from: string;
  recalculated_operations: number;
}

const MAX_RATE = 100000;

const pad = (n: number) => String(n).padStart(2, '0');
/** Локальная календарная дата YYYY-MM-DD (без сдвига UTC). */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDateOnly = (s: string) => new Date(`${s}T12:00:00`);

/**
 * Валидация ввода. Вынесена отдельно, чтобы не зависеть от БД.
 * Дата вступления в силу — от 1-го числа текущего месяца до сегодня:
 * будущие ставки не поддерживаем, а более ранние месяцы — это уже закрытые периоды.
 */
export function validateRateInput(
  rate: unknown,
  effectiveFrom: unknown,
  today: Date = new Date(),
): { rate: number | null; effectiveFrom: string } {
  let parsedRate: number | null = null;
  if (rate !== null && rate !== undefined) {
    const n = typeof rate === 'number' ? rate : Number(String(rate).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > MAX_RATE) {
      throw new BadRequestException(`Ставка должна быть числом от 0 до ${MAX_RATE}`);
    }
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
      throw new BadRequestException('Ставка задаётся с точностью до копеек (2 знака)');
    }
    parsedRate = Math.round(n * 100) / 100;
  }

  const todayStr = ymd(today);
  const monthStart = `${todayStr.slice(0, 8)}01`;
  const from = effectiveFrom == null || effectiveFrom === '' ? todayStr : String(effectiveFrom);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(toDateOnly(from).getTime())) {
    throw new BadRequestException('Дата должна быть в формате YYYY-MM-DD');
  }
  if (from > todayStr) {
    throw new BadRequestException('Дата вступления в силу не может быть в будущем');
  }
  if (from < monthStart) {
    throw new BadRequestException('Менять ставку задним числом можно только в пределах текущего месяца');
  }
  return { rate: parsedRate, effectiveFrom: from };
}

@Injectable()
export class WarehouseRatesService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /** Склад админа определяется только по его профилю (JWT), а не по параметрам запроса. */
  private async resolveWarehouse(warehouseId: number): Promise<{ code: string; name: string }> {
    const w = await this.db.queryOne<{ code: string; name: string }>(
      `SELECT code, name FROM warehouses WHERE id = @id`,
      { id: warehouseId },
    );
    if (!w) throw new NotFoundException('Склад пользователя не найден');
    return w;
  }

  async list(warehouseId: number): Promise<{ warehouse: { code: string; name: string }; rates: WarehouseRateRow[] }> {
    const warehouse = await this.resolveWarehouse(warehouseId);
    const rates = await this.db.query<WarehouseRateRow>(
      `
      WITH codes AS (
        SELECT wcr_code FROM wcr_picking_norms WHERE is_active = 1
        UNION
        SELECT wcr_code FROM wcr_mapping WHERE is_active = 1
        UNION
        SELECT wcr_code FROM wcr_warehouse_rates WHERE warehouse_code = @wh AND is_active = 1
      )
      SELECT
        c.wcr_code,
        COALESCE(wp.description_new, wn.description, wm.operation_type, c.wcr_code) AS description,
        COALESCE(cur.area, wp.participant_area, wm.participant_area, N'')          AS area,
        wp.picking_type,
        CASE WHEN wp.wcr_code IS NOT NULL THEN CAST(wp.rate AS FLOAT) ELSE CAST(t.rate AS FLOAT) END AS default_rate,
        CAST(cur.rate AS FLOAT)                                                     AS custom_rate,
        CONVERT(VARCHAR(10), cur.valid_from, 23)                                    AS custom_from
      FROM codes c
      LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = c.wcr_code AND wp.is_active = 1
      LEFT JOIN wcr_norms wn         ON wn.wcr_code = c.wcr_code AND wn.is_active = 1
      LEFT JOIN wcr_mapping wm       ON wm.wcr_code = c.wcr_code AND wm.is_active = 1
      OUTER APPLY (
        SELECT TOP 1 tt.rate
        FROM tariffs tt
        WHERE tt.operation_type = wm.operation_type
          AND (tt.warehouse_code = @wh OR tt.warehouse_code = 'ALL')
          AND tt.is_active = 1
          AND CAST(GETDATE() AS DATE) >= tt.valid_from
          AND (tt.valid_to IS NULL OR CAST(GETDATE() AS DATE) <= tt.valid_to)
        ORDER BY CASE WHEN tt.warehouse_code = @wh THEN 0 ELSE 1 END, tt.valid_from DESC
      ) t
      OUTER APPLY (
        SELECT TOP 1 r.rate, r.area, r.valid_from
        FROM wcr_warehouse_rates r
        WHERE r.warehouse_code = @wh AND r.wcr_code = c.wcr_code AND r.is_active = 1
          AND CAST(GETDATE() AS DATE) >= r.valid_from
          AND (r.valid_to IS NULL OR CAST(GETDATE() AS DATE) <= r.valid_to)
        ORDER BY r.valid_from DESC
      ) cur
      ORDER BY COALESCE(cur.area, wp.participant_area, wm.participant_area, N''), c.wcr_code
      `,
      { wh: warehouse.code },
    );
    return { warehouse, rates };
  }

  /**
   * Установить (rate) или сбросить к общей ставке (rate = null) расценку для WCR
   * на складе админа, начиная с effectiveFrom.
   *
   * Версионирование: предыдущая ставка закрывается днём раньше, поэтому операции до
   * effectiveFrom продолжают считаться по старой ставке (v_salary_details смотрит на дату операции).
   * Затем пересчитывается operations.amount с effectiveFrom — только для не закрытых периодов
   * (salary_summary), как в scripts/recalc-warehouse-rates.js.
   */
  async setRate(
    warehouseId: number,
    wcrCode: string,
    rateInput: unknown,
    effectiveFromInput: unknown,
    actor: { id: number; employeeId: string },
  ): Promise<SetRateResult> {
    const { rate, effectiveFrom } = validateRateInput(rateInput, effectiveFromInput);
    const warehouse = await this.resolveWarehouse(warehouseId);
    const code = (wcrCode || '').trim().toUpperCase();
    if (!code || code.length > 50) throw new BadRequestException('Некорректный код WCR');

    const known = await this.db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (
         SELECT wcr_code FROM wcr_picking_norms WHERE is_active = 1 AND wcr_code = @c
         UNION SELECT wcr_code FROM wcr_mapping WHERE is_active = 1 AND wcr_code = @c
         UNION SELECT wcr_code FROM wcr_warehouse_rates WHERE warehouse_code = @wh AND wcr_code = @c
       ) x`,
      { c: code, wh: warehouse.code },
    );
    if (!known || known.n === 0) throw new NotFoundException(`Код WCR ${code} не найден в справочнике`);

    const tx = new sql.Transaction(this.db.getPool());
    await tx.begin();
    try {
      const req = () => {
        const r = new sql.Request(tx);
        r.input('wh', sql.NVarChar(10), warehouse.code);
        r.input('wcr', sql.NVarChar(50), code);
        r.input('from', sql.Date, toDateOnly(effectiveFrom));
        return r;
      };

      // Участок для новой строки: из текущей ставки склада, иначе из справочников
      const areaRow = await req().query(
        `SELECT TOP 1 area FROM (
           SELECT area, 0 AS pr, valid_from FROM wcr_warehouse_rates WHERE warehouse_code = @wh AND wcr_code = @wcr
           UNION ALL SELECT participant_area, 1, NULL FROM wcr_picking_norms WHERE wcr_code = @wcr AND is_active = 1
           UNION ALL SELECT participant_area, 2, NULL FROM wcr_mapping WHERE wcr_code = @wcr AND is_active = 1
         ) a WHERE area IS NOT NULL ORDER BY pr, valid_from DESC`,
      );
      const area: string = areaRow.recordset[0]?.area ?? '';
      const normRow = await req().query(
        `SELECT TOP 1 norm_aei_per_hour FROM wcr_warehouse_rates
         WHERE warehouse_code = @wh AND wcr_code = @wcr ORDER BY valid_from DESC`,
      );
      const norm: number | null = normRow.recordset[0]?.norm_aei_per_hour ?? null;

      // 1. Строки, начинающиеся с этой даты или позже, вытесняются новой версией
      await req().query(
        `DELETE FROM wcr_warehouse_rates WHERE warehouse_code = @wh AND wcr_code = @wcr AND valid_from >= @from`,
      );
      // 2. Предыдущую версию закрываем днём раньше
      await req().query(
        `UPDATE wcr_warehouse_rates SET valid_to = DATEADD(DAY, -1, @from)
         WHERE warehouse_code = @wh AND wcr_code = @wcr AND is_active = 1
           AND valid_from < @from AND (valid_to IS NULL OR valid_to >= @from)`,
      );
      // 3. Новая версия (для сброса к общей — не создаём)
      if (rate !== null) {
        const ins = req();
        ins.input('area', sql.NVarChar(100), area);
        ins.input('norm', sql.Decimal(9, 2), norm);
        ins.input('rate', sql.Decimal(9, 2), rate);
        await ins.query(
          `INSERT INTO wcr_warehouse_rates (warehouse_code, wcr_code, area, norm_aei_per_hour, rate, valid_from)
           VALUES (@wh, @wcr, @area, @norm, @rate, @from)`,
        );
      }

      // 4. Пересчёт сумм операций с даты вступления (кроме закрытых периодов).
      //    Своя ставка → count × rate; сброс → общая ставка (комплектация, иначе тариф по mapping, иначе 0).
      const upd = req();
      upd.input('newRate', sql.Float, rate);
      const result = await upd.query(
        `UPDATE o SET
           o.amount = CAST(ISNULL(o.count, 0) AS FLOAT) * COALESCE(
             @newRate,
             CASE
               WHEN wp.wcr_code IS NOT NULL THEN ISNULL(wp.rate, 0)
               WHEN wm.wcr_code IS NOT NULL THEN ISNULL(tr.rate, 0)
               ELSE 0
             END),
           o.updated_at = GETDATE()
         FROM operations o
         LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
         LEFT JOIN wcr_mapping wm       ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
         OUTER APPLY (
           SELECT TOP 1 tt.rate FROM tariffs tt
           WHERE tt.operation_type = wm.operation_type
             AND (tt.warehouse_code = o.warehouse_code OR tt.warehouse_code = 'ALL')
             AND tt.is_active = 1
             AND o.operation_date >= tt.valid_from
             AND (tt.valid_to IS NULL OR o.operation_date <= tt.valid_to)
           ORDER BY CASE WHEN tt.warehouse_code = o.warehouse_code THEN 0 ELSE 1 END, tt.valid_from DESC
         ) tr
         WHERE o.warehouse_code = @wh
           AND o.wcr_code = @wcr
           AND o.operation_date >= @from
           AND NOT EXISTS (
             SELECT 1 FROM salary_summary ss
             WHERE ss.user_id = o.user_id
               AND CAST(o.operation_date AS DATE) BETWEEN ss.period_start AND ss.period_end
           )`,
      );

      await tx.commit();
      const recalculated = result.rowsAffected[0] ?? 0;
      this.logger.log(
        `Ставка склада ${warehouse.code} ${code}: ${rate ?? 'сброс к общей'} с ${effectiveFrom}; ` +
          `пересчитано операций: ${recalculated}; изменил ${actor.employeeId} (id=${actor.id})`,
        'WarehouseRates',
      );
      return {
        warehouse_code: warehouse.code,
        wcr_code: code,
        rate,
        effective_from: effectiveFrom,
        recalculated_operations: recalculated,
      };
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }
}
