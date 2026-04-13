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
  const aeiWcr = await pool.request().query("SELECT TOP 1 wcr_code FROM wcr_norms WHERE is_active = 1");
  const pickingWcr = await pool.request().query("SELECT TOP 1 wcr_code, rate FROM wcr_picking_norms WHERE is_active = 1 AND rate IS NOT NULL");
  
  console.log('AEI WCR:', aeiWcr.recordset[0]);
  console.log('Picking WCR:', pickingWcr.recordset[0]);
  await pool.close();
}

run().catch(console.error);