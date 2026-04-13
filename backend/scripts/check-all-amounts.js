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
    SELECT
      SUM(o.amount) as total_amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND u.employee_id = '00075649'
      AND o.wcr_code != 'FIXAEIMAR'
  `);
  console.log(res.recordset);
  await pool.close();
}
run().catch(console.error);