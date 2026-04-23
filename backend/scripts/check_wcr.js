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
  
  const normsResult = await pool.request().query(`
    SELECT * FROM wcr_norms WHERE wcr_code IN ('RPL1', 'RPL2')
  `);
  console.log("WCR NORMS (Block 1):");
  console.table(normsResult.recordset);
  
  const pickingNormsResult = await pool.request().query(`
    SELECT * FROM wcr_picking_norms WHERE wcr_code IN ('RPL1', 'RPL2')
  `);
  console.log("WCR PICKING NORMS (Block 2):");
  console.table(pickingNormsResult.recordset);
  
  const mappingResult = await pool.request().query(`
    SELECT * FROM wcr_mapping WHERE participant_area = N'Приемка и Хранение'
  `);
  console.log("WCR MAPPING for Приемка и Хранение:");
  console.table(mappingResult.recordset);
  
  await pool.close();
}

main().catch(console.error);