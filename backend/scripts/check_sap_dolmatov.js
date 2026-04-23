const axios = require('axios');

const SAP_BASE = 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV';
const SAP_USER = 'SALAR_TO_PWM';
const SAP_PASS = '9pVQMGLC';

async function main() {
  // Try querying Dolmatov specifically: Employeeid eq '00075649' or '75649'
  const filter = `$filter=(Lgnum eq '02DQ' and (ConfirmedDate ge datetime'2026-03-01T00:00:00' and ConfirmedDate le datetime'2026-03-31T23:59:59')) and (Employeeid eq '00075649' or Processor eq '00075649')`;
  const url = `${SAP_BASE}/WHOSet?${filter}&$format=json`;

  try {
    const resp = await axios.get(url, {
      auth: { username: SAP_USER, password: SAP_PASS },
      timeout: 120000,
    });
    
    const items = resp.data?.d?.results || [];
    console.log(`Found ${items.length} items for Dolmatov in 02DQ`);
    
    const wcrCounts = {};
    let totalAEI = 0;
    let totalProd = 0;
    
    for (const item of items) {
      const wcr = item.Wcr || 'UNKNOWN';
      wcrCounts[wcr] = (wcrCounts[wcr] || 0) + 1;
      totalAEI += parseFloat(item.ZsumAmountItm || '0');
      totalProd += parseFloat(item.ZprodWtItm || '0');
    }
    
    console.table(wcrCounts);
    console.log(`Total AEI: ${totalAEI}, Total Prod: ${totalProd}`);
    
  } catch (err) {
    console.error('SAP Request failed:', err.message);
  }
}

main().catch(console.error);