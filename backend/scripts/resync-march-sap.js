const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sapService = app.get(SapIntegrationService);

  const start = new Date('2026-03-01T00:00:00Z');
  const end = new Date('2026-03-31T23:59:59Z');

  console.log(`Starting SAP sync for period: ${start.toISOString()} to ${end.toISOString()}`);
  
  try {
    await sapService.syncPeriod(start, end);
    console.log('SAP sync completed successfully.');
  } catch (error) {
    console.error('Error during SAP sync:', error);
  }

  await app.close();
}

bootstrap().catch(console.error);
