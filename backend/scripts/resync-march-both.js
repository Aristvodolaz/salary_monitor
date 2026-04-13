const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sapService = app.get(SapIntegrationService);

  const start = new Date('2026-03-01T00:00:00Z');
  const end = new Date('2026-03-31T23:59:59Z');

  console.log(`Starting FULL SAP sync for period: ${start.toISOString()} to ${end.toISOString()}`);
  
  try {
    // 1. Полная выгрузка во все операции
    console.log('--- 1. Выполняется syncPeriod (все операции) ---');
    await sapService.syncPeriod(start, end);
    
    // 2. Выгрузка только нормативов в отдельную таблицу
    console.log('--- 2. Выполняется syncNormsOnly (только нормативы) ---');
    await sapService.syncNormsOnly(start, end);
    
    console.log('SAP sync completed successfully for BOTH tables.');
  } catch (error) {
    console.error('Error during SAP sync:', error);
  }

  await app.close();
}

run().catch(console.error);
