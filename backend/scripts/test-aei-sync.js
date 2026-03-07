/**
 * Тестовая синхронизация для проверки загрузки АЕИ
 */

const axios = require('axios');
const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: {
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD
  },
  timeout: 120000,
  proxy: false
});

async function testAeiSync() {
  try {
    console.log('🧪 ТЕСТ ЗАГРУЗКИ АЕИ ИЗ SAP\n');
    console.log('='.repeat(70));
    
    await sql.connect(dbConfig);
    console.log('✅ Подключено к БД\n');
    
    // Тестируем на одном складе
    const testWarehouse = '0SK1';
    const startDate = new Date(2026, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(2026, 0, 31, 23, 59, 59, 999); // Весь январь
    
    const formatDate = (date) => date.toISOString().split('.')[0];
    const filter = `$filter=(Lgnum eq '${testWarehouse}' and (ConfirmedDate ge datetime'${formatDate(startDate)}' and ConfirmedDate le datetime'${formatDate(endDate)}'))`;
    const url = `/WHOSet?${filter}`;
    
    console.log(`📦 Тестовый склад: ${testWarehouse}`);
    console.log(`📅 Период: ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}\n`);
    console.log(`🔍 Запрос к SAP...`);
    
    const response = await axiosInstance.get(url);
    const results = response.data?.d?.results || [];
    
    console.log(`📊 Получено записей: ${results.length}\n`);
    
    if (results.length > 0) {
      console.log('📝 Первые 5 записей с АЕИ:\n');
      
      for (let i = 0; i < Math.min(5, results.length); i++) {
        const item = results[i];
        const aei = parseFloat(item.ZsumAmountItm || 0);
        const wcr = item.Wcr;
        const actdura = parseFloat(item.Actdura || 0);
        
        console.log(`${i + 1}. WCR: ${wcr}`);
        console.log(`   АЕИ (ZsumAmountItm): ${aei}`);
        console.log(`   Время (Actdura): ${actdura} мин`);
        console.log(`   Сотрудник: ${item.Employeeid}`);
        console.log(`   ФИО: ${item.McName1} ${item.McName2}`);
        console.log('');
      }
      
      // Статистика по АЕИ
      const withAei = results.filter(r => parseFloat(r.ZsumAmountItm || 0) > 0).length;
      const withoutAei = results.length - withAei;
      
      console.log('='.repeat(70));
      console.log('📊 СТАТИСТИКА АЕИ:');
      console.log('='.repeat(70));
      console.log(`✅ С АЕИ (ZsumAmountItm > 0): ${withAei}`);
      console.log(`⚠️ Без АЕИ (ZsumAmountItm = 0): ${withoutAei}`);
      console.log(`📈 Процент с АЕИ: ${((withAei / results.length) * 100).toFixed(1)}%`);
    } else {
      console.log('⚠️ Нет данных за указанный период');
    }
    
    await sql.close();
    console.log('\n✅ ТЕСТ ЗАВЕРШЕН!\n');
    
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testAeiSync();
