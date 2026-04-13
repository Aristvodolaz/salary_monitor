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
  
  // Вставляем маппинги (wcr_mapping) для всех новых кодов
  console.log('Вставляем маппинги...');
  await pool.request().query(`
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active)
    SELECT wcr_code, wcr_code, 'Приемка и Хранение', 1
    FROM wcr_norms
    WHERE wcr_code NOT IN (SELECT wcr_code FROM wcr_mapping)
  `);

  // Вставляем тарифы (tariffs) для всех новых кодов (с рейтом из norm_value)
  console.log('Вставляем тарифы...');
  await pool.request().query(`
    INSERT INTO tariffs (operation_type, warehouse_code, rate, valid_from, is_active)
    SELECT wcr_code, 'ALL', ISNULL(norm_value, 0), '2020-01-01', 1
    FROM wcr_norms
    WHERE wcr_code NOT IN (SELECT operation_type FROM tariffs)
  `);

  console.log('Done.');
  pool.close();
}
run().catch(console.error);