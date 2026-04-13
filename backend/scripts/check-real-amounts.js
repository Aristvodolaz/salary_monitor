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
      u.employee_id,
      u.fio,
      SUM(CASE WHEN wn.wcr_code IS NOT NULL AND o.wcr_code != 'FIXAEIMAR' THEN o.amount ELSE 0 END) as aei_amount,
      SUM(CASE WHEN wp.wcr_code IS NOT NULL AND o.wcr_code != 'FIXPCKMAR' AND wp.rate IS NOT NULL THEN o.prod_count * wp.rate ELSE 0 END) as picking_amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND u.employee_id = '00075649'
    GROUP BY u.employee_id, u.fio
  `);
  console.log(res.recordset);
  await pool.close();
}
run().catch(console.error);