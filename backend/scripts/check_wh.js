const sql = require('mssql');

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(DB);
  const result = await pool.request().query(`
    SELECT DISTINCT w.code
    FROM users u
    JOIN warehouses w ON u.warehouse_id = w.id
    WHERE u.employee_id IN ('00075649', '00078423', '00078692', '00087615')
  `);
  console.log("Warehouses for these employees:");
  console.table(result.recordset);
  await pool.close();
}

main().catch(console.error);