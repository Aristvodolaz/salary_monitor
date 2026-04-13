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

  // Check how many operations Dolmatov has in total in March
  const res1 = await pool.request().query(`
    SELECT COUNT(*) as cnt, SUM(amount) as sum_amt, SUM(count) as sum_aei
    FROM operations o
    JOIN users u ON u.id = o.user_id
    WHERE u.employee_id = '00075649' 
      AND o.operation_date >= '2026-03-01' 
      AND o.operation_date < '2026-04-01'
      AND o.wcr_code != 'FIXAEIMAR'
  `);
  console.log('Dolmatov operations in DB:', res1.recordset[0]);

  const res2 = await pool.request().query(`
    SELECT TOP 10 o.wcr_code, o.amount, o.count, wn.wcr_code as in_norms
    FROM operations o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code
    WHERE u.employee_id = '00075649' 
      AND o.operation_date >= '2026-03-01' 
      AND o.operation_date < '2026-04-01'
      AND o.wcr_code != 'FIXAEIMAR'
  `);
  console.log('Sample Dolmatov operations:', res2.recordset);

  // Is Dolmatov's money in missing tariffs or something else?
  // Let's check sync_logs
  const res3 = await pool.request().query(`
    SELECT TOP 5 error_message FROM sync_logs ORDER BY id DESC
  `);
  console.log('Recent sync logs:', res3.recordset);

  await pool.close();
}
run().catch(console.error);