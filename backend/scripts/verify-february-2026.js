/**
 * ВЕРИФИКАЦИЯ ДАННЫХ ЗА ФЕВРАЛЬ 2026
 * 
 * Запускать ПОСЛЕ sync-february-2026.js
 * Проверяет:  
 *  1. Итоги по складам
 *  2. 02DQ детально (Канчурина)
 *  3. Формулу amount = count × rate
 *  4. Дубли
 *  5. Сравнение с ожидаемыми значениями
 */

const sql  = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server:   process.env.DB_HOST     || 'PRM-SRV-MSSQL-01.komus.net',
  port:     parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME     || 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
  requestTimeout: 60000,
};

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ВЕРИФИКАЦИЯ ДАННЫХ ЗА ФЕВРАЛЬ 2026                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const pool = await sql.connect(dbConfig);

  // ─── 1. Итоги по складам ────────────────────────────────────
  console.log('━━━ 1. ИТОГИ ПО СКЛАДАМ ━━━');
  const byWh = await pool.request().query(`
    SELECT 
      warehouse_code,
      COUNT(DISTINCT user_id) AS employees,
      COUNT(*) AS operations,
      SUM(count) AS total_aei,
      SUM(amount) AS total_salary,
      COUNT(DISTINCT CAST(operation_date AS DATE)) AS work_days
    FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
    GROUP BY warehouse_code
    ORDER BY total_salary DESC
  `);
  
  if (byWh.recordset.length === 0) {
    console.log('  ❌ НЕТ ДАННЫХ ЗА ФЕВРАЛЬ 2026!\n');
    await pool.close();
    return;
  }

  let grandOps = 0, grandAei = 0, grandSalary = 0;
  console.log('  Склад   Сотр.   Операц.    АЕИ       Сумма       Дни');
  console.log('  ──────────────────────────────────────────────────────');
  byWh.recordset.forEach(r => {
    grandOps += r.operations;
    grandAei += r.total_aei || 0;
    grandSalary += r.total_salary || 0;
    console.log(
      `  ${String(r.warehouse_code).padEnd(8)}${String(r.employees).padStart(5)}` +
      `${String(r.operations).padStart(9)}${String(r.total_aei||0).padStart(8)}` +
      `${(r.total_salary||0).toFixed(2).padStart(12)}${String(r.work_days).padStart(8)}`
    );
  });
  console.log('  ──────────────────────────────────────────────────────');
  console.log(`  ИТОГО:        ${String(grandOps).padStart(9)}${String(grandAei).padStart(8)}${grandSalary.toFixed(2).padStart(12)}\n`);

  // ─── 2. Детально 02DQ ──────────────────────────────────────
  console.log('━━━ 2. СКЛАД 02DQ — ДЕТАЛЬНО ━━━');
  const dq = await pool.request().query(`
    SELECT 
      u.fio,
      u.id AS user_id,
      COUNT(*) AS ops_count,
      SUM(o.count) AS total_aei,
      SUM(o.amount) AS total_salary,
      COUNT(DISTINCT CAST(o.operation_date AS DATE)) AS work_days
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE o.warehouse_code = '02DQ'
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
    GROUP BY u.fio, u.id
    ORDER BY total_salary DESC
  `);

  if (dq.recordset.length === 0) {
    console.log('  ❌ Нет данных по складу 02DQ!\n');
  } else {
    dq.recordset.forEach(r => {
      const marker = r.user_id === 565 ? ' ★★★' : '';
      console.log(`  [${r.user_id}] ${String(r.fio).padEnd(35)} ops=${String(r.ops_count).padStart(4)} AEI=${String(r.total_aei).padStart(6)} сумма=${(r.total_salary||0).toFixed(2).padStart(10)}  дни=${r.work_days}${marker}`);
    });
    console.log('');
  }

  // ─── 3. Канчурина детально ─────────────────────────────────
  console.log('━━━ 3. КАНЧУРИНА (user_id=565) — ДЕТАЛЬНО ━━━');
  const kanch = await pool.request().query(`
    SELECT 
      o.operation_type,
      COUNT(*) AS ops_count,
      SUM(o.count) AS total_aei,
      SUM(o.amount) AS total_amount,
      MAX(t.rate) AS rate,
      -- Проверка формулы
      SUM(CASE WHEN ABS(o.amount - o.count * COALESCE(t.rate, 0)) > 0.01 THEN 1 ELSE 0 END) AS formula_errors
    FROM operations o
    LEFT JOIN tariffs t ON
      (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND t.is_active = 1
    WHERE o.user_id = 565
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
    GROUP BY o.operation_type
    ORDER BY total_amount DESC
  `);

  if (kanch.recordset.length === 0) {
    console.log('  ❌ Нет операций Канчуриной за февраль\n');
  } else {
    let total = 0;
    let formulaOk = true;
    kanch.recordset.forEach(r => {
      total += r.total_amount || 0;
      if (r.formula_errors > 0) formulaOk = false;
      const fErr = r.formula_errors > 0 ? ` ⚠️ ${r.formula_errors} ошибок формулы!` : '';
      console.log(
        `  ${String(r.operation_type).padEnd(35)} ` +
        `AEI=${String(r.total_aei).padStart(5)} × ${(r.rate||0).toFixed(2)} = ${(r.total_amount||0).toFixed(2).padStart(10)} руб.  ops=${r.ops_count}${fErr}`
      );
    });
    console.log(`\n  ИТОГО:             ${total.toFixed(2)} руб.`);
    console.log(`  ОЖИДАЕТСЯ:         37 812 руб.`);
    console.log(`  РАЗНИЦА:           ${(37812 - total).toFixed(2)} руб.`);
    
    if (formulaOk) {
      console.log('  ✅ Формула: все записи amount = кол-во_АЕИ × стоимость_операции');
    } else {
      console.log('  ⚠️  ФОРМУЛА: есть записи с нарушением!');
    }
    console.log('');
  }

  // ─── 4. Канчурина по дням ──────────────────────────────────
  console.log('━━━ 4. КАНЧУРИНА — ПО ДНЯМ ━━━');
  const kanchDays = await pool.request().query(`
    SELECT 
      CAST(operation_date AS DATE) AS op_date,
      COUNT(*) AS ops_count,
      SUM(count) AS total_aei,
      SUM(amount) AS total_amount
    FROM operations
    WHERE user_id = 565
      AND operation_date >= '2026-02-01'
      AND operation_date <  '2026-03-01'
    GROUP BY CAST(operation_date AS DATE)
    ORDER BY op_date
  `);

  if (kanchDays.recordset.length > 0) {
    kanchDays.recordset.forEach(r => {
      console.log(`  ${String(r.op_date).slice(0,10)}: ops=${String(r.ops_count).padStart(4)}  AEI=${String(r.total_aei).padStart(5)}  сумма=${(r.total_amount||0).toFixed(2).padStart(10)}`);
    });
    console.log(`  Рабочих дней: ${kanchDays.recordset.length}\n`);
  }

  // ─── 5. МИРОВАЯ проверка формулы ───────────────────────────
  console.log('━━━ 5. ГЛОБАЛЬНАЯ ПРОВЕРКА ФОРМУЛЫ ━━━');
  const globalCheck = await pool.request().query(`
    SELECT COUNT(*) AS bad_count
    FROM operations o
    INNER JOIN tariffs t ON
      (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND t.is_active = 1
    WHERE o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
      AND ABS(o.amount - o.count * t.rate) > 0.01
  `);
  const badGlobal = globalCheck.recordset[0].bad_count;
  if (badGlobal === 0) {
    console.log('  ✅ Все записи за февраль: amount = кол-во_АЕИ × стоимость_операции\n');
  } else {
    console.log(`  ⚠️  ${badGlobal} записей с нарушением формулы!\n`);
  }

  // ─── 6. Проверка дублей ────────────────────────────────────
  console.log('━━━ 6. ПРОВЕРКА ДУБЛЕЙ ━━━');
  const dupes = await pool.request().query(`
    SELECT user_id, operation_type, sap_order_id, COUNT(*) AS cnt
    FROM operations
    WHERE operation_date >= '2026-02-01'
      AND operation_date <  '2026-03-01'
    GROUP BY user_id, operation_type, sap_order_id
    HAVING COUNT(*) > 1
  `);
  if (dupes.recordset.length === 0) {
    console.log('  ✅ Дублей нет\n');
  } else {
    console.log(`  ⚠️  ${dupes.recordset.length} групп дублей\n`);
  }

  await pool.close();
  console.log('✅ ВЕРИФИКАЦИЯ ЗАВЕРШЕНА!\n');
}

main().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
