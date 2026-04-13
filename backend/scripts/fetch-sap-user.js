const axios = require('axios');
const http = require('http');

async function run() {
  const auth = Buffer.from('SALAR_TO_PWM:9pVQMGLC').toString('base64');
  const ax = axios.create({
    baseURL: 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV',
    headers: { 'Authorization': `Basic ${auth}` },
    httpAgent: new http.Agent({ keepAlive: true }),
    timeout: 30000
  });

  const empId = '00075649'; // Dolmatov
  const startDate = '2026-03-01T00:00:00';
  const endDate = '2026-03-31T23:59:59';
  
  // Try Employeeid
  const filter = `$filter=(Employeeid eq '${empId}' and ConfirmedDate ge datetime'${startDate}' and ConfirmedDate le datetime'${endDate}')`;
  
  console.log('Fetching from SAP...', filter);
  
  try {
    const res = await ax.get(`/WHOSet?${filter}&$format=json`);
    const items = res.data?.d?.results || [];
    console.log(`SAP returned ${items.length} items for ${empId} (by Employeeid)`);
    
    let aeiTotal = 0;
    let prodTotal = 0;
    const wcrStats = {};
    
    for (const item of items) {
      const aei = Math.round(parseFloat(item.ZsumAmountItm || '0'));
      const prod = Math.round(parseFloat(item.ZprodWtItm || '0'));
      const wcr = (item.Wcr || '').trim();
      
      aeiTotal += aei;
      prodTotal += prod;
      
      if (!wcrStats[wcr]) wcrStats[wcr] = { count: 0, aei: 0, prod: 0 };
      wcrStats[wcr].count++;
      wcrStats[wcr].aei += aei;
      wcrStats[wcr].prod += prod;
    }
    
    console.log(`Total AEI (ZsumAmountItm): ${aeiTotal}`);
    console.log(`Total Prod (ZprodWtItm): ${prodTotal}`);
    console.log('Stats by WCR:', wcrStats);
    
  } catch (err) {
    console.error('Error fetching from SAP:', err.message);
  }
}

run();
