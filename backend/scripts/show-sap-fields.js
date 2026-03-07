/**
 * Вывод всех полей из записи SAP
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

async function showSapFields() {
  try {
    console.log('📋 ВСЕ ПОЛЯ ИЗ ЗАПИСИ SAP\n');
    console.log('='.repeat(70));
    
    const testWarehouse = '0SK1';
    const startDate = new Date(2026, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(2026, 0, 31, 23, 59, 59, 999);
    
    const formatDate = (date) => date.toISOString().split('.')[0];
    const filter = `$filter=(Lgnum eq '${testWarehouse}' and (ConfirmedDate ge datetime'${formatDate(startDate)}' and ConfirmedDate le datetime'${formatDate(endDate)}'))`;
    const url = `/WHOSet?${filter}&$top=1`;
    
    console.log(`🔍 Запрос первой записи...`);
    
    const response = await axiosInstance.get(url);
    const results = response.data?.d?.results || [];
    
    if (results.length > 0) {
      const item = results[0];
      
      console.log('\n📝 ВСЕ ПОЛЯ И ИХ ЗНАЧЕНИЯ:\n');
      
      const fields = Object.keys(item).sort();
      
      fields.forEach(field => {
        const value = item[field];
        const type = typeof value;
        const displayValue = type === 'object' ? JSON.stringify(value) : value;
        console.log(`${field.padEnd(30)} | ${type.padEnd(10)} | ${displayValue}`);
      });
      
      console.log('\n' + '='.repeat(70));
      console.log(`📊 Всего полей: ${fields.length}`);
      
    } else {
      console.log('⚠️ Нет данных');
    }
    
    console.log('\n✅ ГОТОВО!\n');
    
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

showSapFields();
