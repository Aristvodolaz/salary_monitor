const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sapService = app.get(SapIntegrationService);
  
  // Custom fetch to see what SAP returns for 'UNLOAD' or 'INB_CD'
  const axiosInstance = sapService.axiosInstance;
  const filter = `$filter=(Wcr eq 'UNLOAD' or Wcr eq 'INB_CD') and (ConfirmedDate ge datetime'2026-03-01T00:00:00' and ConfirmedDate le datetime'2026-03-02T23:59:59')`;
  const url = `/WHOSet?${filter}&$format=json`;
  
  console.log('Fetching from SAP...');
  const resp = await axiosInstance.get(url, { timeout: 60000 });
  const items = resp.data?.d?.results || [];
  
  console.log(`Found ${items.length} items. First 5:`);
  for (let i = 0; i < Math.min(5, items.length); i++) {
    const item = items[i];
    console.log({
      Who: item.Who,
      Wcr: item.Wcr,
      ZsumAmountItm: item.ZsumAmountItm,
      ZprodWtItm: item.ZprodWtItm,
      Actdura: item.Actdura,
      Processor: item.Processor
    });
  }
  
  await app.close();
}

run().catch(console.error);