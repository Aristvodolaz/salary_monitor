const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 180000,
});

async function scanWhs() {
  const day = '2026-02-02T00:00:00';
  const end = '2026-02-02T23:59:59';

  // Поиск ВСЕХ записей за день без фильтра по складу
  const filter = `$filter=(ConfirmedDate ge datetime'${day}' and ConfirmedDate le datetime'${end}')`;
  const url = `/WHOSet?${filter}&$format=json&$top=100`;

  console.log(`📡 Запрос SAP: ВСЕ склады за 2 февраля...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Найдено: ${results.length} записей`);
    
    if (results.length > 0) {
      const whs = {};
      results.forEach(r => {
        whs[r.Lgnum] = (whs[r.Lgnum] || 0) + 1;
      });
      console.log('📈 Склады в SAP за 2 фев:');
      console.table(whs);
    } else {
      console.log('❌ Вообще нет данных в SAP за этот день!');
    }
  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

scanWhs();
