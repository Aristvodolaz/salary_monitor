const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 180000,
});

async function spy() {
  const employeeId = '00084310'; // КАНЧУРИНА
  const wh = '02DQ';
  const start = '2026-02-01T00:00:00';
  const end = '2026-02-28T23:59:59';

  // Фильтр по сотруднику и периоду
  const filter = `$filter=(Lgnum eq '${wh}' and Employeeid eq '${employeeId}' and ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}')`;
  const url = `/WHOSet?${filter}&$format=json`;

  console.log(`📡 Запрос к SAP для Канчуриной (00084310)...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Всего найдено в SAP: ${results.length} записей\n`);

    if (results.length > 0) {
      const samples = results.slice(0, 10);
      samples.forEach((s, i) => {
        console.log(`[${i}] Who: ${s.Who}, Wcr: ${s.Wcr}, AEI: ${s.ZsumAmountItm}, Date: ${s.ConfirmedDate}`);
      });
      
      // Сводка по WCR
      const wcrStats = {};
      results.forEach(r => {
        wcrStats[r.Wcr] = (wcrStats[r.Wcr] || 0) + 1;
      });
      console.log('\n📈 Сводка по WCR для Канчуриной:');
      console.table(wcrStats);
    }
  } catch (err) {
    console.error(`❌ Ошибка SAP: ${err.message}`);
  }
}

spy();
