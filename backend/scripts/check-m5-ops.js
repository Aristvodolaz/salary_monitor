const sql = require('mssql');
const config = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, user: 'sa', password: 'icY2eGuyfU', database: 'SalaryMonitor', options: { encrypt: false, trustServerCertificate: true } };

async function searchM5() {
  const pool = await sql.connect(config);
  const res = await pool.request().query("SELECT * FROM wcr_mapping WHERE wcr_code LIKE '%M5%' OR operation_type LIKE '%М5%'");
  console.log('--- WCR MAPPING M5 ---');
  console.table(res.recordset);
  
  const tariffs = await pool.request().query("SELECT * FROM tariffs WHERE operation_type LIKE '%М5%'");
  console.log('\n--- TARIFFS M5 ---');
  console.table(tariffs.recordset);
  
  await pool.close();
}

searchM5();
