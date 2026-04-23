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
  const r = await pool.request().query(`
    SELECT definition FROM sys.sql_modules sm
    JOIN sys.objects o ON sm.object_id=o.object_id
    WHERE o.name='v_salary_details'
  `);
  if (r.recordset.length) console.log(r.recordset[0].definition);
  else console.log('View not found');

  // Also check superadmin role
  const roles = await pool.request().query(`SELECT DISTINCT role FROM users WHERE is_active=1`);
  console.log('\nRoles:', roles.recordset.map(r=>r.role).join(', '));

  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
