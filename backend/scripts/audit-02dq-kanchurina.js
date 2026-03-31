const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 300000,
});

async function auditKanch() {
  const wh = '02DQ';
  const start = '2026-02-02T00:00:00';
  const end   = '2026-02-02T23:59:59';
  
  const filter = `$filter=(Lgnum eq '${wh}' and (ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}'))`;
  const url = `/WHOSet?${filter}&$format=json`;

  console.log(`📡 Аудит 02DQ за 2 февраля...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Всего в SAP (02DQ 2 фев): ${results.length} записей`);

    if (results.length > 0) {
      // Ищем сотрудника с фамилией КАНЧУРИНА (любая вариация)
      const found = results.filter(r => 
        (r.McName1 || '').toUpperCase().includes('КАНЧУРИНА') || 
        (r.McName2 || '').toUpperCase().includes('КАНЧУРИНА') ||
        (r.Employeeid === '00084310') ||
        (r.Processor === '00084310')
      );

      if (found.length > 0) {
        console.log(`✅ НАЙДЕНО ${found.length} записей для Канчуриной!`);
        found.forEach((r, i) => {
          console.log(`[${i}] ID=${r.Employeeid || r.Processor}, Wcr=${r.Wcr}, AEI=${r.ZsumAmountItm}, Name=${r.McName1} ${r.McName2}`);
        });
      } else {
        console.log('❌ КАНЧУРИНА не найдена среди этих записей.');
        // Выборочно глянем несколько имен
        const names = Array.from(new Set(results.map(r => `${r.McName1} ${r.McName2}`.trim()))).slice(0, 10);
        console.log('Примеры имен в 02DQ:', names);
      }
    }
  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

auditKanch();
