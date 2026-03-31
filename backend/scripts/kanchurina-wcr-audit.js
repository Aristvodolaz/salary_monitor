const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 300000,
});

async function findMissingWcrs() {
  const employeeId = '00084310';
  const start = '2026-02-01T00:00:00';
  const end   = '2026-02-28T23:59:59';
  
  const filter = `$filter=(ConfirmedDate ge datetime'${start}' and ConfirmedDate le datetime'${end}' and Employeeid eq '${employeeId}')`;
  const url = `/WHOSet?${filter}&$format=json`;

  console.log(`📡 Поиск всех операций Канчуриной за февраль...`);
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log(`📊 Всего найдено: ${results.length} записей`);

    const wcrs = {};
    results.forEach(r => {
      wcrs[r.Wcr] = (wcrs[r.Wcr] || 0) + 1;
    });

    console.log('\n📈 Сводка по WCR:');
    console.table(wcrs);
    
    // Также посчитаем общую АЕИ по каждому WCR
    const aeiByWcr = {};
    results.forEach(r => {
      const aei = Math.round(parseFloat(r.ZsumAmountItm || '0'));
      aeiByWcr[r.Wcr] = (aeiByWcr[r.Wcr] || 0) + aei;
    });
    console.log('\n💰 Всего АЕИ по WCR:');
    console.table(aeiByWcr);

  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

findMissingWcrs();
