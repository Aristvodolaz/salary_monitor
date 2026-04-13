const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sapService = app.get(SapIntegrationService);
  
  const axiosInstance = sapService.axiosInstance;
  // Let's ask SAP for Wcr eq 'INB_CD' OR 'UNLOAD' for ANY warehouse in March
  const filter = `$filter=(Wcr eq 'INB_CD' or Wcr eq 'UNLOAD' or Wcr eq 'INT_BRAK') and ConfirmedDate ge datetime'2026-03-01T00:00:00' and ConfirmedDate le datetime'2026-03-03T23:59:59'`;
  const url = `/WHOSet?${filter}&$top=100&$format=json`;
  
  console.log('Fetching target WCRs from SAP...');
  try {
    const resp = await axiosInstance.get(url, { timeout: 60000 });
    const items = resp.data?.d?.results || [];
    
    console.log(`Found ${items.length} items.`);
    if (items.length > 0) {
      console.log('Sample:', {
        Wcr: items[0].Wcr,
        ZsumAmountItm: items[0].ZsumAmountItm,
        ZprodWtItm: items[0].ZprodWtItm,
        Actdura: items[0].Actdura
      });
    }
  } catch(err) {
    console.error(err.message);
  }
  
  await app.close();
}

run().catch(console.error);