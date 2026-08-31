/**
 * Обновляет справочник sap_employees из z_employee и синхронизирует users.
 *
 *   cd /home/admin-lc/salary_monitor/backend
 *   node scripts/sync-employees.js
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
  console.error('Не найден dist/app.module.js. Выполните: npm run build');
  process.exit(1);
}

require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(appModulePath);
  const servicePath =
    resolveDist(path.join('sap-integration', 'sap-integration.service.js'));
  const { SapIntegrationService } = require(servicePath);

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
