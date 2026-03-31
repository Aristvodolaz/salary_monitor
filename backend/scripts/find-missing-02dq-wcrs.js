const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const sql = require('mssql');

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 300000,
});

async function findMissingWcrsIn02DQ() {
  const dbConfig = {
    user: process.env.DB_USER || 'sa', password: process.env.DB_PASSWORD || 'icY2eGuyfU',
    server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net', port: parseInt(process.env.DB_PORT || '59587'),
    database: process.env.DB_NAME || 'SalaryMonitor', options: { encrypt: false, trustServerCertificate: true }
  };
  const pool = await sql.connect(dbConfig);
  const wcrRes = await pool.request().query('SELECT wcr_code FROM wcr_mapping WHERE is_active = 1');
  const mappedWcrs = new Set(wcrRes.recordset.map(r => r.wcr_code));
  await pool.close();

  const start = '2026-02-02T00:00:00';
  const end   = '2026-02-02T23:59:59';
  const url = `/WHOSet?$filter=(Lgnum eq '02DQ' and (ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}'))&$format=json`;

  console.log(`📡 Анализ 02DQ за 2 февраля...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Всего в SAP: ${results.length} записей`);

    const unmapped = {};
    results.forEach(r => {
      if (!mappedWcrs.has(r.Wcr)) {
        const aei = Math.round(parseFloat(r.ZsumAmountItm || '0'));
        if (aei > 0) {
          unmapped[r.Wcr] = (unmapped[r.Wcr] || 0) + aei;
        }
      }
    });

    console.log('\n📈 НЕМАППИРОВАННЫЕ WCR в 02DQ с ненулевым АЕИ (за 2 фев):');
    Object.entries(unmapped)
      .sort((a,b) => b[1] - a[1])
      .forEach(([wcr, aei]) => {
        console.log(`${wcr.padEnd(10)} | Всего AEI: ${aei}`);
      });

  } catch (err) { console.error(`❌ Ошибка: ${err.message}`); }
}

findMissingWcrsIn02DQ();
