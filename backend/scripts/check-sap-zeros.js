const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sapService = app.get(SapIntegrationService);
  
  const axiosInstance = sapService.axiosInstance;
  const filter = `$filter=Lgnum eq 'M802' and ConfirmedDate ge datetime'2026-03-01T00:00:00' and ConfirmedDate le datetime'2026-03-01T04:00:00'`;
  const url = `/WHOSet?${filter}&$top=1000&$format=json`;
  
  console.log('Fetching top 1000 M802 items from SAP...');
  const resp = await axiosInstance.get(url, { timeout: 60000 });
  const items = resp.data?.d?.results || [];
  
  console.log(`Found ${items.length} items.`);
  const wcrs = new Set();
  for (const item of items) {
    wcrs.add(item.Wcr);
  }
  console.log('WCRs in this batch:', Array.from(wcrs).join(', '));
  
  // also check if we have any items with aeiCount=0 and prodCount=0
  let zeros = 0;
  const zeroWcrs = new Set();
  for (const item of items) {
    const aeiCount  = parseFloat(item.ZsumAmountItm || '0');
    const prodCount = parseFloat(item.ZprodWtItm   || '0');
    if (aeiCount <= 0 && prodCount <= 0) {
      zeros++;
      zeroWcrs.add(item.Wcr);
    }
  }
  console.log(`Items with zero counts: ${zeros}`);
  console.log(`WCRs of zero count items: ${Array.from(zeroWcrs).join(', ')}`);
  
  await app.close();
}

run().catch(console.error);