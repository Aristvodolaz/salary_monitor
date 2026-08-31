/**
 * Полная перезагрузка операций за последние 3 календарных месяца.
 *
 * Перед запуском в SSMS: database/migrations/015_add_sap_employees.sql
 *
 *   cd /home/admin-lc/salary_monitor/backend
 *   node scripts/reload-3months.js
 *
 * Идёт несколько часов. Не прерывать.
 */
require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const backendRoot = path.join(__dirname, '..');
process.chdir(backendRoot);

function resolveDist(rel) {
  const candidates = [
    path.join(backendRoot, 'dist', rel),
    path.join(backendRoot, 'dist', 'src', rel),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

let appModulePath = resolveDist('app.module.js');
if (!appModulePath) {
  console.log('dist не найден — запускаю npm run build ...');
  execSync('npm run build', { cwd: backendRoot, stdio: 'inherit' });
  appModulePath = resolveDist('app.module.js');
}

if (!appModulePath) {
  console.error('Не найден dist/app.module.js после сборки.');
  console.error('Выполните вручную:');
  console.error('  cd /home/admin-lc/salary_monitor/backend');
  console.error('  npm run build');
  console.error('  node scripts/reload-3months.js');
  process.exit(1);
}

require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(appModulePath);
  const servicePath =
    resolveDist(path.join('sap-integration', 'sap-integration.service.js'));
  const { SapIntegrationService } = require(servicePath);

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
