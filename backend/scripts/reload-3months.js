/**
 * Полная перезагрузка операций за последние 3 календарных месяца.
 *
 * 1. Тянет справочник сотрудников из z_employee
 * 2. Удаляет operations за период (это делает sync склада)
 * 3. Заново загружает WHOSet и привязывает людей через sap_employees
 *
 * Перед запуском:
 *   1. В SSMS выполнить database/migrations/015_add_sap_employees.sql
 *   2. cd backend && npm run build
 *
 *   node scripts/reload-3months.js
 *
 * Идёт несколько часов (склады × дни). Не прерывать.
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

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  console.log(
    `Перезагрузка ${start.toISOString().slice(0, 10)} — ${end.toISOString().slice(0, 10)}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule);
  const sap = app.get(SapIntegrationService);
  await sap.reloadLast3Months();
  console.log('Перезагрузка завершена');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
