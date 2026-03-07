const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  user: 'sa',
  password: 'icY2eGuyfU',
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  options: { encrypt: false, trustServerCertificate: true }
};

(async () => {
  const pool = await sql.connect(dbConfig);
  const sections = ['М2', 'М3', 'М4', 'М5', 'МС', 'ДО', 'ФС', 'ПМ'];
  
  console.log('🗑️ Удаление тарифов для складов-участков:\n');
  
  for (const code of sections) {
    const result = await pool.query`DELETE FROM tariffs WHERE warehouse_code = ${code}`;
    console.log(`   ${code}: удалено ${result.rowsAffected[0]} тарифов`);
  }
  
  console.log('\n✅ Готово!');
  await pool.close();
})();
