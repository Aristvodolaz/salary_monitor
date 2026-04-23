const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');
const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 60000,
};
async function main() {
  const pool = await sql.connect(cfg);

  // Что видит v_salary_details за март — по складам
  const r = await pool.request().query(`
    SELECT
      v.warehouse_code,
      COUNT(DISTINCT v.user_id)    AS users,
      COUNT(*)                     AS ops,
      ROUND(SUM(v.base_amount),2)  AS total_amount
    FROM v_salary_details v
    WHERE v.operation_date >= '2026-03-01'
      AND v.operation_date <= '2026-03-31'
      AND v.base_amount > 0
    GROUP BY v.warehouse_code
    ORDER BY total_amount DESC
  `);
  console.log('=== v_salary_details МАРТ 2026 (amount > 0) ===');
  console.table(r.recordset);
  console.log('ИТОГО:', r.recordset.reduce((s,x)=>s+x.total_amount,0).toLocaleString('ru'));

  // warehouses table
  const wh = await pool.request().query(`SELECT id, code, name FROM warehouses ORDER BY code`);
  console.log('\n=== warehouses ===');
  console.table(wh.recordset);

  // users with admin role + their warehouse_id
  const admins = await pool.request().query(`
    SELECT u.employee_id, u.fio, u.role, u.warehouse_id, w.code AS wh_code
    FROM users u
    LEFT JOIN warehouses w ON u.warehouse_id = w.id
    WHERE u.role = 'admin' AND u.is_active = 1
  `);
  console.log('\n=== Администраторы ===');
  console.table(admins.recordset);

  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
