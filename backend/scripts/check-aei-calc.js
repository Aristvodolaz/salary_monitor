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
        u.fio,
        SUM(o.count) as total_aei,
        SUM(o.count * wn.norm_value) as calc_amount,
        SUM(o.amount) as o_amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND u.employee_id IN ('00089780', '00089916', '00098670', '00078692')
      AND o.wcr_code NOT LIKE 'FIX%'
    GROUP BY u.fio
  `);
  console.log('Calculation check:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);