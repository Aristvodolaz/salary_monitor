/**
 * Снимок статистики нормативов WCR → таблица norms_stats_snapshot.
 * Логика совпадает с NormsService.getMarchStats + saveStatsSnapshot.
 *
 * Использование:
 *   node scripts/snapshot-norms-stats.js 2026-03-01 2026-03-31
 *   node scripts/snapshot-norms-stats.js 2026-03-01 2026-03-31 02DQ
 */
const sql = require('mssql');

const cfg = {
  server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net',
  port: parseInt(process.env.DB_PORT || '59587', 10),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  database: process.env.DB_NAME || 'SalaryMonitor',
  options: { encrypt: false, trustServerCertificate: true },
};

function computeStats(rows) {
  return rows.map((r) => {
    const hours = r.total_actdura_min > 0 ? r.total_actdura_min / 60 : null;
    const actual_aei_per_hour =
      hours !== null && r.total_aei > 0 ? Math.round((r.total_aei / hours) * 10) / 10 : null;
    const norm_pct =
      actual_aei_per_hour !== null && r.norm_value !== null && r.norm_value > 0
        ? Math.round((actual_aei_per_hour / r.norm_value) * 1000) / 10
        : null;
    return {
      ...r,
      actual_aei_per_hour,
      norm_pct,
    };
  });
}

async function main() {
  const startDate = process.argv[2] || '2026-03-01';
  const endDate = process.argv[3] || '2026-03-31';
  const warehouseCode = process.argv[4] || undefined;

  console.log(`Период: ${startDate} — ${endDate}, склад: ${warehouseCode ?? 'ВСЕ'}`);

  const pool = await sql.connect(cfg);
  const warehouseFilter = warehouseCode ? 'AND o.warehouse_code = @warehouseCode' : '';

  const raw = await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .input('warehouseCode', sql.NVarChar(20), warehouseCode || null)
    .query(`
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
    `);

  const rows = computeStats(raw.recordset);
  const tr = new sql.Transaction(pool);
  await tr.begin();
  try {
    const del = new sql.Request(tr);
    del.input('period_start', sql.Date, new Date(`${startDate}T12:00:00`));
    del.input('period_end', sql.Date, new Date(`${endDate}T12:00:00`));
    del.input('warehouse_code', sql.NVarChar(20), warehouseCode || null);
    const delR = await del.query(`
      DELETE FROM norms_stats_snapshot
      WHERE period_start = @period_start AND period_end = @period_end
        AND ((@warehouse_code IS NULL AND warehouse_code IS NULL) OR warehouse_code = @warehouse_code)
    `);
    const deleted = Array.isArray(delR.rowsAffected) ? delR.rowsAffected[0] : delR.rowsAffected;

    for (const row of rows) {
      const ins = new sql.Request(tr);
      ins.input('period_start', sql.Date, new Date(`${startDate}T12:00:00`));
      ins.input('period_end', sql.Date, new Date(`${endDate}T12:00:00`));
      ins.input('warehouse_code', sql.NVarChar(20), warehouseCode || null);
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
    await tr.commit();
    console.log(`✅ Готово: удалено строк ~${deleted}, вставлено ${rows.length}`);
  } catch (e) {
    await tr.rollback();
    throw e;
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
