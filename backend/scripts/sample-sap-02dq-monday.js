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
  const day = '2026-02-02T00:00:00'; // Понедельник
  const end = '2026-02-02T23:59:59';

  const filter = `$filter=(Lgnum eq '${wh}' and ConfirmedDate ge datetime'${day}' and ConfirmedDate le datetime'${end}')`;
  const url = `/WHOSet?${filter}&$format=json&$top=100`;

  console.log(`📡 Запрос SAP: 02DQ за 2 февраля (первые 100)...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Найдено: ${results.length} записей`);
    
    const emps = {};
    results.forEach(r => {
      const id = r.Employeeid || r.Processor;
      const name = `${r.McName1} ${r.McName2}`.trim();
      if (id) emps[id] = name;
    });
    
    console.log('👥 Список сотрудников из выборки 02DQ 2 фев (ID -> Имя):');
    Object.entries(emps).forEach(([id, name]) => {
      console.log(`  ${id.padEnd(10)} | ${name}`);
    });
    
    const kFound = Object.entries(emps).filter(([id, name]) => name.includes('КАНЧУРИНА'));
    if (kFound.length > 0) {
       console.log('\n✅ КАНЧУРИНА НАЙДЕНА!', kFound);
    } else {
       console.log('\n❌ КАНЧУРИНА в первых 100 не найдена.');
    }

  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

sampleWh();
