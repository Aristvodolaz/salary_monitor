const sql = require('mssql');
const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};
async function run() {
  const pool = await sql.connect(config);
  
  const res = await pool.request().query(`
    SELECT TOP 5 wcr_code, operation_date, count, prod_count
    FROM operations
    WHERE operation_date >= '2026-03-01' AND warehouse_code = 'M802'
  `);
  console.log('Sample operations:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);