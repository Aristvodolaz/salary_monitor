const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sapService = app.get(SapIntegrationService);

  const start = new Date('2026-03-01T00:00:00Z');
  const end = new Date('2026-03-31T23:59:59.999Z');

  console.log(`Запускаю syncNormsOnly за март (${start.toISOString()} - ${end.toISOString()})...`);
  await sapService.syncNormsOnly(start, end);

  console.log('Готово!');
  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
