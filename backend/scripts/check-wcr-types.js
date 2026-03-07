/**
 * Проверка типов WCR в данных SAP
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: {
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD
  },
  timeout: 120000,
  proxy: false
});

async function checkWcrTypes() {
  try {
    console.log('🔍 ПРОВЕРКА ТИПОВ WCR В SAP\n');
    console.log('='.repeat(70));
    
    const testWarehouse = '0SK1';
    const startDate = new Date(2026, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(2026, 0, 31, 23, 59, 59, 999);
    
    const formatDate = (date) => date.toISOString().split('.')[0];
    const filter = `$filter=(Lgnum eq '${testWarehouse}' and (ConfirmedDate ge datetime'${formatDate(startDate)}' and ConfirmedDate le datetime'${formatDate(endDate)}'))`;
    const url = `/WHOSet?${filter}`;
    
    console.log(`📦 Склад: ${testWarehouse}`);
    console.log(`📅 Период: Январь 2026\n`);
    console.log(`🔍 Запрос к SAP...`);
    
    const response = await axiosInstance.get(url);
    const results = response.data?.d?.results || [];
    
    console.log(`📊 Получено записей: ${results.length}\n`);
    
    // Подсчет уникальных WCR
    const wcrCounts = {};
    const wcrWithAei = {};
    
    results.forEach(item => {
      const wcr = item.Wcr || 'UNKNOWN';
      const aei = parseFloat(item.ZsumAmountItm || 0);
      
      wcrCounts[wcr] = (wcrCounts[wcr] || 0) + 1;
      
      if (aei > 0) {
        wcrWithAei[wcr] = (wcrWithAei[wcr] || 0) + 1;
      }
    });
    
    console.log('📋 ТОП-20 ТИПОВ WCR:\n');
    
    const sorted = Object.entries(wcrCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    
    sorted.forEach(([wcr, count], index) => {
      const withAei = wcrWithAei[wcr] || 0;
      const percent = ((withAei / count) * 100).toFixed(1);
      console.log(`${(index + 1).toString().padStart(2)}. ${wcr.padEnd(10)} | Записей: ${count.toString().padStart(6)} | С АЕИ: ${withAei.toString().padStart(6)} (${percent}%)`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log(`📊 Всего уникальных WCR: ${Object.keys(wcrCounts).length}`);
    console.log(`✅ Записей с АЕИ > 0: ${Object.values(wcrWithAei).reduce((a, b) => a + b, 0)}`);
    console.log('='.repeat(70));
    
    console.log('\n✅ ПРОВЕРКА ЗАВЕРШЕНА!\n');
    
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

checkWcrTypes();
