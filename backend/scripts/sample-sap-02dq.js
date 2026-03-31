const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 180000,
});

async function sampleWh() {
  const wh = '02DQ';
  const day = '2026-02-01T00:00:00';
  const end = '2026-02-01T23:59:59';

  const filter = `$filter=(Lgnum eq '${wh}' and ConfirmedDate ge datetime'${day}' and ConfirmedDate le datetime'${end}')`;
  const url = `/WHOSet?${filter}&$format=json&$top=100`;

  console.log(`📡 Запрос SAP: 02DQ за 1 февраля (первые 100)...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Найдено: ${results.length} записей`);
    
    // Выведем уникальные имена и ID
    const emps = {};
    results.forEach(r => {
      const id = r.Employeeid || r.Processor;
      const name = `${r.McName1} ${r.McName2}`.trim();
      emps[id] = name;
    });
    
    console.log('👥 Список сотрудников из выборки:');
    console.table(emps);
    
    // Ищем КАНЧУРИНА в этой выборке
    const found = Object.entries(emps).filter(([id, name]) => name.includes('КАНЧУРИНА'));
    if (found.length > 0) {
       console.log('✅ НАЙДЕНА!', found);
    } else {
       console.log('❌ В первых 100 не найдена.');
    }

  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

sampleWh();
