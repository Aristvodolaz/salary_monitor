/**
 * Полная перезагрузка операций за последние 3 календарных месяца.
 *
 *   cd /home/admin-lc/salary_monitor/backend
 *   npx tsc -p tsconfig.json
 *   node scripts/reload-3months.js
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
  console.error('Не найден dist/app.module.js.');
  console.error('На сервере выполните по одной строке:');
  console.error('  pm2 stop salary-monitor-backend');
  console.error('  rm -rf /home/admin-lc/salary_monitor/backend/dist');
  console.error('  cd /home/admin-lc/salary_monitor/backend');
  console.error('  npm run build');
  console.error('  node scripts/reload-3months.js');
  process.exit(1);
}

require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(appModulePath);
  const servicePath = findInDist('sap-integration.service.js');
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
