const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const sql = require('mssql');

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 300000,
});

async function findMissingWcrsInMarch() {
  const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'icY2eGuyfU',
    server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net',
    port: parseInt(process.env.DB_PORT || '59587'),
    database: process.env.DB_NAME || 'SalaryMonitor',
    options: { encrypt: false, trustServerCertificate: true }
  };
  const pool = await sql.connect(dbConfig);
  const wcrRes = await pool.request().query('SELECT wcr_code FROM wcr_mapping WHERE is_active = 1');
  const mappedWcrs = new Set(wcrRes.recordset.map(r => r.wcr_code));
  
  const warehousesRes = await pool.request().query('SELECT code FROM warehouses WHERE is_active = 1');
  const warehouses = warehousesRes.recordset.map(w => w.code);
  await pool.close();

  const start = '2026-03-01T00:00:00';
  const end   = '2026-03-31T23:59:59';

  console.log(`📡 Анализ за МАРТ...`);
  
  for (const wh of warehouses) {
    const url = `/WHOSet?$filter=(Lgnum eq '${wh}' and (ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}'))&$format=json`;
    console.log(`📦 Проверка склада ${wh}...`);
    try {
      const resp = await axiosInstance.get(url);
      const results = resp.data?.d?.results || [];
      const unmapped = {};
      results.forEach(r => {
        if (!mappedWcrs.has(r.Wcr)) {
          const aei = Math.round(parseFloat(r.ZsumAmountItm || '0'));
          if (aei > 0) {
            unmapped[r.Wcr] = (unmapped[r.Wcr] || 0) + aei;
          }
        }
      });

      if (Object.keys(unmapped).length > 0) {
        console.log(`📈 НЕМАППИРОВАННЫЕ WCR в ${wh} за МАРТ:`);
        Object.entries(unmapped)
          .sort((a,b) => b[1] - a[1])
          .forEach(([wcr, aei]) => console.log(`  ${wcr.padEnd(10)} | Всего AEI: ${aei}`));
      } else {
        console.log(`✅ В ${wh} все WCR с суммами замаппированы.`);
      }
    } catch (err) {
      console.error(`❌ Ошибка склада ${wh}: ${err.message}`);
    }
  }
}

findMissingWcrsInMarch();
