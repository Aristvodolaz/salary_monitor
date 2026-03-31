const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 180000,
});

async function findEmployee() {
  const employeeId = '00084310';
  const queries = [
    // 1. По всем складам за февраль (Employeeid)
    `$filter=(ConfirmedDate ge datetime'2026-02-01T00:00:00' and ConfirmedDate le datetime'2026-02-28T23:59:59' and Employeeid eq '${employeeId}')`,
    // 2. По всем складам за февраль (Processor)
    `$filter=(ConfirmedDate ge datetime'2026-02-01T00:00:00' and ConfirmedDate le datetime'2026-02-28T23:59:59' and Processor eq '${employeeId}')`,
    // 3. За март (чтобы убедиться что вообще есть)
    `$filter=(ConfirmedDate ge datetime'2026-03-01T00:00:00' and Employeeid eq '${employeeId}')`,
    // 4. Поиск по фамилии? (через substringof или McName1)
    `$filter=(substringof('КАНЧУРИНА', McName1) or substringof('КАНЧУРИНА', McName2))`
  ];

  for (const q of queries) {
    console.log(`\n📡 Запрос SAP: ${q.slice(0, 100)}...`);
    try {
      const resp = await axiosInstance.get(`/WHOSet?${q}&$format=json`);
      const results = resp.data?.d?.results || [];
      console.log(`📊 Найдено: ${results.length} записей`);
      if (results.length > 0) {
        console.log(`  Склад(Lgnum): ${results[0].Lgnum}, Wcr: ${results[0].Wcr}, EmpId: ${results[0].Employeeid}, Proc: ${results[0].Processor}`);
        // Показать все склады где она была
        const lgnums = new Set(results.map(r => r.Lgnum));
        console.log('  Склады:', Array.from(lgnums));
        break; 
      }
    } catch (err) {
      console.error(`❌ Ошибка: ${err.message}`);
    }
  }
}

findEmployee();
