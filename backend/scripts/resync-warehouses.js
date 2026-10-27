// Перезагрузка периода из SAP только для указанных складов (использует код приложения из dist/).
//
//   npm run build
//   node scripts/resync-warehouses.js 2026-08-20 2026-10-20 0SK1 0SK2 0SK5 0SK6
//
// ВНИМАНИЕ: для каждого склада период сначала проверяется пробным запросом к SAP, затем
// стираются операции склада за период и грузятся заново (как в /api/sap/sync-period).
// Если SAP недоступен — склад не трогается.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ConfigService } = require('@nestjs/config');
const { LoggerService } = require('../dist/common/logger/logger.service');
const { DatabaseService } = require('../dist/database/database.service');
const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

async function main() {
  const [from, to, ...warehouses] = process.argv.slice(2);
  if (!from || !to || warehouses.length === 0) {
    throw new Error('Использование: node scripts/resync-warehouses.js YYYY-MM-DD YYYY-MM-DD СКЛАД [СКЛАД ...]');
  }
  const start = new Date(from);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  if (isNaN(start) || isNaN(end) || start > end) throw new Error('Некорректный период');

  const config = new ConfigService();
  const logger = new LoggerService(config);
  const db = new DatabaseService(config, logger);
  await db.onModuleInit();
  const sap = new SapIntegrationService(config, db, logger);

  const failed = [];
  for (const wh of warehouses) {
    try {
      console.log(`\n=== ${wh}: ${from} — ${to} ===`);
      await sap.syncWarehouseManual(wh, start, end);
    } catch (e) {
      console.error(`ОШИБКА ${wh}: ${e.message}`);
      failed.push(wh);
    }
  }
  await db.onModuleDestroy();
  console.log(failed.length ? `\nНе обновлены: ${failed.join(', ')}` : '\nГотово: все склады обновлены');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
