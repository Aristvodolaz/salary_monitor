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
    SELECT u.employee_id, w.code as warehouse_code
    FROM users u
    JOIN warehouses w ON w.id = u.warehouse_id
    WHERE u.employee_id IN ('00089780', '00089916', '00098670', '00078692')
  `);
  console.log('User warehouses:');
  console.log(res.recordset);

  pool.close();
}
run().catch(console.error);