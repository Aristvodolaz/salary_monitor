const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 300000,
});

async function deepSearch() {
  const wh = '02DQ';
  const start = '2026-02-02T00:00:00'; // Пн
  const end   = '2026-02-03T23:59:59'; // Вт
  
  const filter = `$filter=(Lgnum eq '${wh}' and ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}')`;
  const url = `/WHOSet?${filter}&$format=json&$top=1000`; // Берем 1000 записей

  console.log(`📡 Запрос 1000 записей 02DQ за 2-3 февраля...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Найдено: ${results.length} записей`);

    if (results.length > 0) {
      const kRows = results.filter(r => 
        (r.McName1 || '').includes('КАНЧУРИНА') || 
        (r.McName2 || '').includes('КАНЧУРИНА') ||
        (r.Employeeid === '00084310') ||
        (r.Processor === '00084310')
      );
      
      if (kRows.length > 0) {
        console.log(`✅ НАЙДЕНО ${kRows.length} записей для Канчуриной!`);
        kRows.forEach((r, i) => {
          console.log(`[${i}] ID=${r.Employeeid || r.Processor}, Name=${r.McName1} ${r.McName2}, Wcr=${r.Wcr}, AEI=${r.ZsumAmountItm}, Who=${r.Who}`);
        });
      } else {
        console.log('❌ Канчурина не найдена в этой выборке из 1000 записей.');
        // Посмотрим первые 5 просто для проверки
        console.log('Первые 5 ID в выборке:', results.slice(0,5).map(r => r.Employeeid || r.Processor));
      }
    }
  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

deepSearch();
