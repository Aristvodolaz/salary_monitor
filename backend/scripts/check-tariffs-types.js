/**
 * Проверка типов операций в tariffs
 */

const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net',
  port: parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME || 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function checkTariffs() {
  try {
    await sql.connect(dbConfig);
    console.log('✅ Подключено к БД\n');
    
    const result = await sql.query`
      SELECT DISTINCT operation_type, rate, norm_aei_per_hour
      FROM tariffs 
      WHERE warehouse_code = 'ALL' AND is_active = 1 
      ORDER BY operation_type
    `;
    
    console.log('📋 ТИПЫ ОПЕРАЦИЙ В TARIFFS (warehouse_code = ALL):');
    console.log('='.repeat(80));
    result.recordset.forEach(r => {
      console.log(`${r.operation_type.padEnd(40)} | Rate: ${r.rate} | Norm: ${r.norm_aei_per_hour}`);
    });
    console.log('='.repeat(80));
    console.log(`\nВсего типов операций: ${result.recordset.length}\n`);
    
    await sql.close();
    
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

checkTariffs();
