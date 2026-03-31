const sql = require('mssql');
const config = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, user: 'sa', password: 'icY2eGuyfU', database: 'SalaryMonitor', options: { encrypt: false, trustServerCertificate: true } };

async function debugKanch() {
  const pool = await sql.connect(config);
  
  console.log('--- USER 565 DETAILS ---');
  const u = await pool.request().query('SELECT * FROM users WHERE id = 565');
  console.log(JSON.stringify(u.recordset, null, 2));

  console.log('\n--- MARCH OPERATIONS (TOP 3) ---');
  const ops = await pool.request().query('SELECT TOP 3 * FROM operations WHERE user_id = 565 AND operation_date >= \'2026-03-01\'');
  console.log(JSON.stringify(ops.recordset, null, 2));

  console.log('\n--- ALL USERS WITH KANCHURINA IN NAME ---');
  const allU = await pool.request().query('SELECT * FROM users WHERE fio LIKE \'%КАНЧУРИНА%\'');
  console.log(JSON.stringify(allU.recordset, null, 2));

  await pool.close();
}

debugKanch();
