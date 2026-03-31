const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sql = require('mssql');

async function main() {
  const config = {
    server: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };

  console.log('Подключаемся к БД:', config.server, config.database);
  const pool = await sql.connect(config);

  // Проверяем маппинг для PPMC
  const ppmcResult = await pool.request().query(`
    SELECT wcr_code, operation_type, participant_area, is_active 
    FROM wcr_mapping 
    WHERE wcr_code LIKE '%PPMC%' OR wcr_code = 'PPMC'
  `);

  console.log('\n=== WCR MAPPING для PPMC ===');
  if (ppmcResult.recordset.length === 0) {
    console.log('❌ Маппинг для PPMC не найден!');
  } else {
    ppmcResult.recordset.forEach((m) => {
      console.log(`WCR: ${m.wcr_code}`);
      console.log(`  → operation_type: ${m.operation_type}`);
      console.log(`  → participant_area: ${m.participant_area}`);
      console.log(`  → is_active: ${m.is_active}`);
      console.log('');
    });
  }

  // Проверяем все маппинги, содержащие "комплект" в названии
  const komplektResult = await pool.request().query(`
    SELECT wcr_code, operation_type, participant_area, is_active 
    FROM wcr_mapping 
    WHERE operation_type LIKE '%комплект%' OR operation_type LIKE '%компл%'
    ORDER BY operation_type
  `);

  console.log('\n=== Все маппинги с "комплект" в типе операции ===');
  komplektResult.recordset.forEach((m) => {
    console.log(`${m.wcr_code} → ${m.operation_type} (active: ${m.is_active})`);
  });

  await pool.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
