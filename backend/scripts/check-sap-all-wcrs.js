const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sapService = app.get(SapIntegrationService);
  
  const axiosInstance = sapService.axiosInstance;
  const filter = `$filter=Lgnum eq '02DQ' and ConfirmedDate ge datetime'2026-03-01T00:00:00' and ConfirmedDate le datetime'2026-03-01T23:59:59'`;
  const url = `/WHOSet?${filter}&$top=20000&$format=json`;
  
  console.log('Fetching top 20000 02DQ items from SAP...');
  const resp = await axiosInstance.get(url, { timeout: 60000 });
  const items = resp.data?.d?.results || [];
  
  console.log(`Found ${items.length} items.`);
  const wcrs = new Set();
  for (const item of items) {
    wcrs.add(item.Wcr);
  }
  console.log('WCRs in this batch:', Array.from(wcrs).join(', '));
  
  await app.close();
}

run().catch(console.error);