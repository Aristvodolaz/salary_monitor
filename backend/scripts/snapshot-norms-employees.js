const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { NormsService } = require('../dist/norms/norms.service');

const WAREHOUSES = [
  { id: 1, code: '01SS' },
  { id: 2, code: '02DQ' },
  { id: 3, code: '02SR' },
  { id: 4, code: '0SK1' },
  { id: 5, code: '0SK2' },
  { id: 6, code: '0SK5' },
  { id: 7, code: '0SK6' },
  { id: 8, code: '0SK8' },
  { id: 9, code: '0SK9' },
  { id: 10, code: 'RR04' }
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const normsService = app.get(NormsService);

  const startDate = process.argv[2] || '2026-03-01';
  const endDate = process.argv[3] || '2026-03-31';

  console.log(`Период выгрузки заработка по нормативам: ${startDate} — ${endDate}`);

  let totalSaved = 0;

  for (const wh of WAREHOUSES) {
    try {
      const res = await normsService.saveEmployeesSnapshot(wh.id, startDate, endDate);
      console.log(`✅ Склад ${wh.code} (ID: ${wh.id}): удалено ${res.deleted}, добавлено ${res.inserted}`);
      totalSaved += res.inserted;
    } catch (e) {
      console.error(`❌ Ошибка на складе ${wh.code}:`, e.message);
    }
  }

  console.log(`\nИтого записей сохранено: ${totalSaved}`);
  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
