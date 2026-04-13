const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sapService = app.get(SapIntegrationService);
  
  const axiosInstance = sapService.axiosInstance;
  const filter = `$filter=ConfirmedDate ge datetime'2026-03-05T00:00:00' and ConfirmedDate le datetime'2026-03-05T23:59:59' and Lgnum eq 'M802'`;
  const url = `/WHOSet?${filter}&$format=json`;
  
  console.log('Fetching from SAP...');
  const resp = await axiosInstance.get(url, { timeout: 60000 });
  const items = resp.data?.d?.results || [];
  
  console.log(`Found ${items.length} items.`);
  
  const wcrCounts = {};
  for (const item of items) {
    wcrCounts[item.Wcr] = (wcrCounts[item.Wcr] || 0) + 1;
  }
  console.log('WCR counts:', wcrCounts);
  
  await app.close();
}

run().catch(console.error);