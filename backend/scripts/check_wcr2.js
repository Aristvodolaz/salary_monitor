const sql = require('mssql');

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(DB);
  
  const result = await pool.request().query(`
    SELECT * FROM wcr_mapping WHERE wcr_code IN ('RPL1', 'RPL2')
  `);
  console.log("WCR MAPPING for RPL1, RPL2:");
  console.table(result.recordset);
  
  await pool.close();
}

main().catch(console.error);