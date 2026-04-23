const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 120000,
};

async function main() {
  const pool = await sql.connect(cfg);

  // Все operation_type из tariffs
  const tar = await pool.request().query(`
    SELECT operation_type, warehouse_code, rate, norm_aei_per_hour,
           valid_from, valid_to, is_active
    FROM tariffs
    WHERE is_active = 1
    ORDER BY operation_type, warehouse_code
  `);
  console.log(`\n=== tariffs (${tar.recordset.length} записей) ===`);
  console.table(tar.recordset);

  // WCR-коды в operations которые дают amount>0
  const workingWcr = await pool.request().query(`
    SELECT TOP 30
      wcr_code, operation_type, participant_area,
      COUNT(*) AS cnt,
      ROUND(SUM(amount),2) AS total_amount,
      COUNT(DISTINCT warehouse_code) AS warehouses
    FROM operations
    WHERE operation_date >= '2026-03-01'
      AND operation_date <  '2026-04-01'
      AND amount > 0
    GROUP BY wcr_code, operation_type, participant_area
    ORDER BY total_amount DESC
  `);
  console.log('\n=== ТОП-30 WCR с amount>0 в марте ===');
  console.table(workingWcr.recordset);

  // wcr_norms — что в них
  const norms = await pool.request().query(`
    SELECT wcr_code, norm_type, description, norm_value, is_active
    FROM wcr_norms WHERE is_active=1
    ORDER BY norm_type, wcr_code
  `);
  console.log(`\n=== wcr_norms (${norms.recordset.length} кодов) ===`);
  console.table(norms.recordset);

  // wcr_picking_norms — первые 20
  const pick = await pool.request().query(`
    SELECT TOP 20 wcr_code, participant_area, picking_type, rate, is_active
    FROM wcr_picking_norms WHERE is_active=1
    ORDER BY participant_area, wcr_code
  `);
  console.log('\n=== wcr_picking_norms (первые 20) ===');
  console.table(pick.recordset);

  // Коды из operations которых НЕТ ни в wcr_mapping, ни в wcr_norms, ни в wcr_picking_norms
  const unknown = await pool.request().query(`
    SELECT TOP 30
      o.wcr_code,
      COUNT(*) AS cnt,
      SUM(o.[count]) AS total_aei,
      SUM(ISNULL(o.prod_count,0)) AS total_prod,
      COUNT(DISTINCT o.warehouse_code) AS warehouses
    FROM operations o
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <  '2026-04-01'
      AND NOT EXISTS (SELECT 1 FROM wcr_mapping wm WHERE wm.wcr_code = o.wcr_code)
      AND NOT EXISTS (SELECT 1 FROM wcr_norms wn WHERE wn.wcr_code = o.wcr_code)
      AND NOT EXISTS (SELECT 1 FROM wcr_picking_norms wp WHERE wp.wcr_code = o.wcr_code)
      AND o.wcr_code IS NOT NULL
    GROUP BY o.wcr_code
    ORDER BY cnt DESC
  `);
  console.log('\n=== ТОП-30 WCR не в ЛЮБОМ справочнике ===');
  console.table(unknown.recordset);

  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
