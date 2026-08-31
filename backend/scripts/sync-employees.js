/**
 * Обновляет справочник sap_employees из z_employee и синхронизирует users.
 * Перед запуском: npm run build
 *
 *   cd backend
 *   node scripts/sync-employees.js
 */
require('reflect-metadata');
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
process.chdir(backendRoot);

const distApp = path.join(backendRoot, 'dist', 'app.module.js');
if (!fs.existsSync(distApp)) {
  console.error('Сначала соберите backend: npm run build');
  process.exit(1);
}

require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

  const app = await NestFactory.createApplicationContext(AppModule);
  const sap = app.get(SapIntegrationService);
  const result = await sap.syncEmployees();
  console.log('Готово:', result);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
