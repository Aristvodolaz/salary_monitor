/**
 * ГЛУБОКАЯ ДИАГНОСТИКА: ПОЧЕМУ У КАНЧУРИНОЙ 6 612 руб. ВМЕСТО 37 812?
 * 
 * Цель: найти ГДЕ именно потерялись данные
 * - Может операции есть, но в другой период?
 * - Может wrong user_id?
 * - Может проблема в WCR-маппинге для склада 02DQ?
 * - Проверяем расценки по скрину
 */

const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  user: 'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options: { encrypt: false, trustServerCertificate: true, requestTimeout: 60000 },
};

const USER_ID = 565;
const EMPLOYEE_ID = '00084310';

async function main() {
  const pool = await sql.connect(config);

  // ─── A. Откуда взялась сумма 6 612?  ─────────────────────────────
  console.log('━━━ A. ОТКУДА ВЗЯЛАСЬ СУММА 6 612? Все периоды ━━━');
  const allOpsRes = await pool.request().query(`
    SELECT 
      YEAR(operation_date) AS yr,
      MONTH(operation_date) AS mn,
      COUNT(*) AS rows_count,
      SUM(count) AS total_aei,
      SUM(amount) AS total_amount
    FROM operations
    WHERE user_id = ${USER_ID}
    GROUP BY YEAR(operation_date), MONTH(operation_date)
    ORDER BY yr, mn
  `);
  if (allOpsRes.recordset.length === 0) {
    console.log('  🔴 Абсолютно пусто — ни одной операции за любой период!\n');
  } else {
    allOpsRes.recordset.forEach(r => {
      console.log(`  ${r.yr}-${String(r.mn).padStart(2,'0')}: ${r.rows_count} строк, АЕИ=${r.total_aei}, сумма=${(r.total_amount||0).toFixed(2)}`);
    });
    console.log('');
  }

  // ─── B. Sync_logs — что говорят логи синхронизации? ─────────────
  console.log('━━━ B. ПОСЛЕДНИЕ SYNC_LOGS ДЛЯ СКЛАДА 02DQ ━━━');
  const syncLogsRes = await pool.request().query(`
    SELECT TOP 20
      id, warehouse_code, sync_start, sync_end, status, records_processed, error_message
    FROM sync_logs
    WHERE warehouse_code = '02DQ'
    ORDER BY sync_start DESC
  `);
  if (syncLogsRes.recordset.length === 0) {
    console.log('  Нет логов для склада 02DQ\n');
  } else {
    syncLogsRes.recordset.forEach(r => {
      const start = r.sync_start ? r.sync_start.toISOString().slice(0,19) : '?';
      const end = r.sync_end ? r.sync_end.toISOString().slice(0,19) : 'running';
      const err = r.error_message ? `  ERR: ${r.error_message.slice(0,80)}` : '';
      console.log(`  ${start} → ${end}  status=${r.status}  records=${r.records_processed}${err}`);
    });
    console.log('');
  }

  // ─── C. Актуальные sync_logs за февраль 2026 ─────────────────────
  console.log('━━━ C. SYNC_LOGS ЗА ФЕВРАЛЬ 2026 (все склады) ━━━');
  const syncFebRes = await pool.request().query(`
    SELECT warehouse_code, sync_start, status, records_processed, error_message
    FROM sync_logs
    WHERE sync_start >= '2026-02-01'
      AND sync_start <  '2026-03-15'
    ORDER BY sync_start DESC
  `);
  if (syncFebRes.recordset.length === 0) {
    console.log('  Нет логов синхронизации за февраль\n');
  } else {
    syncFebRes.recordset.forEach(r => {
      const start = r.sync_start.toISOString().slice(0,19);
      const err = r.error_message ? `  ERR: ${r.error_message.slice(0,80)}` : '';
      console.log(`  ${r.warehouse_code}  ${start}  ${r.status}  records=${r.records_processed}${err}`);
    });
    console.log('');
  }

  // ─── D. WCR-маппинг для склада 02DQ ──────────────────────────────
  console.log('━━━ D. WCR_MAPPING (активные записи) — первые 30 ━━━');
  const wcrRes = await pool.request().query(`
    SELECT TOP 30 wcr_code, operation_type, participant_area, is_active
    FROM wcr_mapping
    WHERE is_active = 1
    ORDER BY wcr_code
  `);
  if (wcrRes.recordset.length === 0) {
    console.log('  🔴 WCR_MAPPING ПУСТОЙ! Это критическая проблема — все операции будут пропускаться.\n');
  } else {
    wcrRes.recordset.forEach(r => {
      console.log(`  WCR=${r.wcr_code}  →  ${r.operation_type}  (участок=${r.participant_area})`);
    });
    console.log(`  Итого активных WCR: ${wcrRes.recordset.length} (показано первые 30)\n`);
  }

  // ─── E. Общее кол-во WCR маппингов ──────────────────────────────
  const wcrCountRes = await pool.request().query(`SELECT COUNT(*) AS total FROM wcr_mapping WHERE is_active = 1`);
  console.log(`  🔢 Всего активных WCR маппингов: ${wcrCountRes.recordset[0].total}\n`);

  // ─── F. Проверка что в operations за февраль по складу 02DQ ──────
  console.log('━━━ F. ОПЕРАЦИИ ЗА ФЕВРАЛЬ 2026 ПО СКЛАДУ 02DQ (все сотрудники) ━━━');
  const warehouseFebRes = await pool.request().query(`
    SELECT 
      COUNT(*) AS rows_count,
      COUNT(DISTINCT user_id) AS unique_users,
      SUM(count) AS total_aei,
      SUM(amount) AS total_amount
    FROM operations
    WHERE warehouse_code = '02DQ'
      AND operation_date >= '2026-02-01'
      AND operation_date <  '2026-03-01'
  `);
  const wf = warehouseFebRes.recordset[0];
  console.log(`  Строк операций: ${wf.rows_count}`);
  console.log(`  Уник. сотрудников: ${wf.unique_users}`);
  console.log(`  Сумм АЕИ: ${wf.total_aei}`);
  console.log(`  Сумма: ${(wf.total_amount||0).toFixed(2)}\n`);

  // ─── G. Проверка расценок по фото: сравнение с ТЗ ────────────────
  console.log('━━━ G. СВЕРКА РАСЦЕНОК — ТЕКУЩИЕ vs ОЖИДАЕМЫЕ ━━━');
  console.log('  (По таблице расценок из ТЗ)\n');

  // Расценки из скрина (второй файл пользователя — таблица расценок)  
  // М2: Штучная=1.4, Упаковка=1.4, Коробочная=15.3, Однострочн=2.0
  // М3: Штучная=6.8, Коробочная=5.4, Однострочн=10.4
  // М4: Штучная=1.4, Упаковка=1.5, Коробочная=5.4, Однострочн=2.4
  // М5: Штучная=1.1, Упаковка=1.2, Коробочная=5.4, Однострочн=1.4
  // МС: Штучная=1.6, Упаковка=1.7, Коробочная=5.4, Однострочн=3.2
  // ДО: Коробочная=7.1
  // ФС: Коробочная=5.9, Штучная=2.8
  // ПМ: Упаковка=4.1

  const expectedTariffs = [
    { type: 'М2 Коробочная комплектация',  rate: 15.3, norm: 23 },
    { type: 'М2 Штучн.компл.однострочн',   rate: 2.0,  norm: 180 },
    { type: 'М2 Штучная комплектация',     rate: 1.4,  norm: 250 },
    { type: 'М2 Упаковка',                 rate: 1.4,  norm: 250 },
    { type: 'М3 Коробочная комплектация',  rate: 5.4,  norm: 65 },
    { type: 'М3 Штучн.компл.однострочн',   rate: 10.4, norm: 34 },
    { type: 'М3 Штучная комплектация',     rate: 6.8,  norm: 52 },
    { type: 'М4 Коробочная комплектация',  rate: 5.4,  norm: 65 },
    { type: 'М4 Штучн.компл.однострочн',   rate: 2.4,  norm: 150 },
    { type: 'М4 Штучная комплектация',     rate: 1.4,  norm: 245 },
    { type: 'М4 Упаковка',                 rate: 1.5,  norm: 240 },
    { type: 'М5 Коробочная комплектация',  rate: 5.4,  norm: 65 },
    { type: 'М5 Штучн.компл.однострочн',   rate: 1.4,  norm: 260 },
    { type: 'М5 Штучная комплектация',     rate: 1.1,  norm: 320 },
    { type: 'М5 Упаковка',                 rate: 1.2,  norm: 300 },
    { type: 'МС Коробочная комплектация',  rate: 5.4,  norm: 65 },
    { type: 'МС Штучн.компл.однострочн',   rate: 3.2,  norm: 110 },
    { type: 'МС Штучная комплектация',     rate: 1.6,  norm: 225 },
    { type: 'МС Упаковка',                 rate: 1.7,  norm: 210 },
    { type: 'ДО Коробочная комплектация',  rate: 7.1,  norm: 50 },
    { type: 'ФС Коробочная комплектация',  rate: 5.9,  norm: 60 },
    { type: 'ФС Штучная комплектация',     rate: 2.8,  norm: 125 },
    { type: 'ПМ Упаковка',                 rate: 4.1,  norm: 87 },
  ];

  const tariffRes = await pool.request().query(`
    SELECT operation_type, rate, norm_aei_per_hour
    FROM tariffs
    WHERE warehouse_code = 'ALL' AND is_active = 1
  `);
  const dbTariffs = new Map(tariffRes.recordset.map(t => [t.operation_type, t]));

  let allOk = true;
  expectedTariffs.forEach(exp => {
    const db = dbTariffs.get(exp.type);
    if (!db) {
      console.log(`  ❌ НЕТ В БД: ${exp.type}  (ожид. rate=${exp.rate})`);
      allOk = false;
    } else {
      const rateOk = Math.abs(db.rate - exp.rate) < 0.001;
      const normOk = db.norm_aei_per_hour === exp.norm || db.norm_aei_per_hour == null;
      if (rateOk && normOk) {
        console.log(`  ✅ ${String(exp.type).padEnd(38)} rate=${db.rate.toFixed(2)} ✔  norm=${db.norm_aei_per_hour} ✔`);
      } else {
        console.log(`  ⚠️  ${String(exp.type).padEnd(38)} БД: rate=${db.rate.toFixed(2)} (ожид=${exp.rate}) | norm=${db.norm_aei_per_hour} (ожид=${exp.norm})`);
        allOk = false;
      }
    }
  });
  
  // Тарифы в БД, которых нет в ТЗ
  dbTariffs.forEach((t, type) => {
    if (!expectedTariffs.find(e => e.type === type)) {
      console.log(`  ℹ️  Есть в БД, нет в ТЗ: ${type} rate=${t.rate} norm=${t.norm_aei_per_hour}`);
    }
  });

  if (allOk) {
    console.log('\n  ✅ Все расценки в БД соответствуют ТЗ!\n');
  } else {
    console.log('\n  ⚠️  Найдены расхождения в расценках (см. выше)\n');
  }

  // ─── H. Итоговый диагноз → что делать ────────────────────────────
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ДИАГНОЗ И ПЛАН ДЕЙСТВИЙ                            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const ops = allOpsRes.recordset;
  const hasAnyOps = ops.length > 0;
  const hasFebOps = ops.some(r => r.yr === 2026 && r.mn === 2);

  if (!hasAnyOps) {
    console.log('🔴 У Канчуриной (user_id=565) НЕТ НИКАКИХ операций в БД.');
    console.log('   Данные из SAP для её склада (02DQ) за февраль не загружены.\n');
    console.log('   ДЕЙСТВИЯ:');
    console.log('   1. Проверить sync_logs — была ли попытка синхронизации');
    console.log('   2. Запустить ручную синхронизацию: POST /api/sap/sync с body:');
    console.log('      { "startDate": "2026-02-01", "endDate": "2026-02-28", "warehouseCode": "02DQ" }');
    console.log('   3. Или через endpoint без warehouseCode — тогда все склады');
    console.log('   4. Проверить что employee_id=00084310 есть в ответе SAP OData\n');
  } else if (!hasFebOps) {
    const existing = ops.map(r => `${r.yr}-${String(r.mn).padStart(2,'0')}`).join(', ');
    console.log(`🟡 Операции ЕСТЬ, но не за февраль. Есть за: ${existing}`);
    console.log('   ДЕЙСТВИЯ: Запустить синхронизацию SAP специально за февраль 2026\n');
  } else {
    console.log('Проблема в другом — операции за февраль есть, но сумма не та.');
    console.log('Шаги: проверить тарифы и формулу (см. выше)\n');
  }

  await pool.close();
}

main().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
