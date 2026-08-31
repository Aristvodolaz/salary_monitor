/**
 * Обновляет справочник sap_employees из z_employee и синхронизирует users.
 *
 *   cd /home/admin-lc/salary_monitor/backend
 *   npx tsc -p tsconfig.json
 *   node scripts/sync-employees.js
 */
require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const backendRoot = path.join(__dirname, '..');
process.chdir(backendRoot);

function findInDist(fileName) {
  const distDir = path.join(backendRoot, 'dist');
  if (!fs.existsSync(distDir)) return null;
  const stack = [distDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === fileName) return full;
    }
  }
  return null;
}

let appModulePath = findInDist('app.module.js');
if (!appModulePath) {
  console.log('app.module.js нет в dist — компилирую через tsc (без удаления dist)...');
  execSync('npx tsc -p tsconfig.json', { cwd: backendRoot, stdio: 'inherit' });
  appModulePath = findInDist('app.module.js');
}

if (!appModulePath) {
  console.error('Не найден dist/app.module.js. Выполните: npx tsc -p tsconfig.json');
  process.exit(1);
}

require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(appModulePath);
  const servicePath = findInDist('sap-integration.service.js');
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
