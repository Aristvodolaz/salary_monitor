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
  const result = await pool.request().query("SELECT TOP 5 employee_id, fio FROM users WHERE fio LIKE N'%Долматов%' OR fio LIKE N'%Захаров%'");
  console.log(result.recordset);
  await pool.close();
}

run().catch(console.error);