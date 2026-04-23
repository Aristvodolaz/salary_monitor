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
    SELECT wm.wcr_code, wm.operation_type, wm.participant_area
    FROM wcr_mapping wm
    LEFT JOIN tariffs t ON wm.operation_type = t.operation_type AND t.is_active = 1
    WHERE t.id IS NULL AND wm.is_active = 1
  `);
  console.log("WCR codes in wcr_mapping but MISSING active tariffs:");
  console.table(result.recordset);
  
  await pool.close();
}

main().catch(console.error);