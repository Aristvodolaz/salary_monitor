const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 180000,
});

async function findEmpFeb() {
  const employeeId = '00084310';
  const start = '2026-02-01T00:00:00';
  const end = '2026-02-28T23:59:59';

  // 1. Поиск по Employeeid за февраль
  const q1 = `$filter=(ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}' and Employeeid eq '${employeeId}')`;
  // 2. Поиск по Processor за февраль
  const q2 = `$filter=(ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}' and Processor eq '${employeeId}')`;
  
  const queries = [q1, q2];

  for (const q of queries) {
    console.log(`\n📡 Запрос: ${q.slice(0, 150)}...`);
    try {
      const resp = await axiosInstance.get(`/WHOSet?${q}&$format=json`);
      const results = resp.data?.d?.results || [];
      console.log(`📊 Найдено: ${results.length} записей`);
      if (results.length > 0) {
        const stats = {};
        results.forEach(r => {
          const key = `${r.Lgnum} | ${r.Wcr}`;
          stats[key] = (stats[key] || 0) + 1;
        });
        console.table(stats);
      }
    } catch (err) {
      console.error(`❌ Ошибка: ${err.message}`);
    }
  }
}

findEmpFeb();
