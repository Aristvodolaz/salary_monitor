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
    SELECT u.fio, w.code
    FROM users u
    JOIN warehouses w ON u.warehouse_id = w.id
    WHERE u.employee_id IN ('00070874', '00100835', '00086717')
  `);
  console.table(result.recordset);
  await pool.close();
}

main().catch(console.error);