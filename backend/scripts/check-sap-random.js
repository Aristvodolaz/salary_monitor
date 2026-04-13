const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sapService = app.get(SapIntegrationService);
  const axiosInstance = sapService.axiosInstance;

  // Let's fetch some random records and see what WCRs actually exist in SAP
  const url = `/WHOSet?$top=1000&$format=json`;
  
  console.log('Fetching top 1000 items from SAP...');
  const resp = await axiosInstance.get(url, { timeout: 60000 });
  const items = resp.data?.d?.results || [];
  
  const wcrs = new Set();
  for (const item of items) {
    if (item.Wcr) wcrs.add(item.Wcr);
  }
  console.log('Distinct WCRs in top 1000:', Array.from(wcrs).sort().join(', '));
  
  await app.close();
}

run().catch(console.error);