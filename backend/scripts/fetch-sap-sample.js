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

  const warehouse = '02SR';
  const startDate = '2026-03-01T00:00:00';
  const endDate = '2026-03-01T23:59:59';
  
  const filter = `$filter=(Lgnum eq '${warehouse}' and ConfirmedDate ge datetime'${startDate}' and ConfirmedDate le datetime'${endDate}')`;
  
  console.log('Fetching from SAP...', filter);
  
  try {
    const res = await ax.get(`/WHOSet?${filter}&$format=json`);
    const items = res.data?.d?.results || [];
    console.log(`SAP returned ${items.length} items for ${warehouse} on 2026-03-01`);
    
    if (items.length > 0) {
      console.log('Sample item:', {
        Processor: items[0].Processor,
        Employeeid: items[0].Employeeid,
        McName1: items[0].McName1,
        McName2: items[0].McName2,
        Wcr: items[0].Wcr,
        ZsumAmountItm: items[0].ZsumAmountItm,
        ZprodWtItm: items[0].ZprodWtItm
      });
    }
  } catch (err) {
    console.error('Error fetching from SAP:', err.message);
  }
}

run();
