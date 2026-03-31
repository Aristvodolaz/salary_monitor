/**
 * ДИАГНОСТИКА КАНЧУРИНОЙ (user_id = 565)
 * 
 * Проверяем:
 * 1. Сколько операций загружено из SAP за февраль
 * 2. Правильность расценок (тарифов) в БД
 * 3. Правильность формулы: amount = count * rate
 * 4. Нет ли пропущенных дней / операций
 * 5. Сравниваем с ожидаемой суммой 37 812 руб.
 */

const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  user: 'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 60000,
  },
};

const USER_ID = 565;
const EXPECTED_SALARY = 37812;

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ДИАГНОСТИКА КАНЧУРИНОЙ  (user_id = 565)            ║');
  console.log('║  Февраль 2026  |  Ожидается: 37 812 руб.            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const pool = await sql.connect(config);

  // ─── 1. Информация о пользователе ───────────────────────────────
  console.log('━━━ 1. ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ ━━━');
  const userRes = await pool.request().query(`
    SELECT u.id, u.employee_id, u.fio, u.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name
    FROM users u
    LEFT JOIN warehouses w ON u.warehouse_id = w.id
    WHERE u.id = ${USER_ID}
  `);
  if (userRes.recordset.length === 0) {
    console.log('❌ Пользователь с id=565 NOT FOUND!');
    await pool.close();
    return;
  }
  const user = userRes.recordset[0];
  console.log(`  id:           ${user.id}`);
  console.log(`  employee_id:  ${user.employee_id}`);
  console.log(`  ФИО:          ${user.fio}`);
  console.log(`  Склад:        ${user.warehouse_code} - ${user.warehouse_name}\n`);

  // ─── 2. Все операции за февраль с разбивкой по дням ─────────────
  console.log('━━━ 2. ОПЕРАЦИИ ЗА ФЕВРАЛЬ 2026 (по дням) ━━━');
  const byDayRes = await pool.request().query(`
    SELECT 
      CAST(o.operation_date AS DATE) AS op_date,
      o.operation_type,
      o.warehouse_code,
      COUNT(*) AS rows_count,
      SUM(o.count) AS total_aei,
      MAX(t.rate) AS rate,
      SUM(o.amount) AS total_amount,
      SUM(o.count) * MAX(t.rate) AS expected_amount,
      -- Проверяем расхождение
      ABS(SUM(o.amount) - SUM(o.count) * MAX(t.rate)) AS delta
    FROM operations o
    LEFT JOIN tariffs t ON
      (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND o.operation_date >= t.valid_from
      AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
      AND t.is_active = 1
    WHERE o.user_id = ${USER_ID}
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
    GROUP BY CAST(o.operation_date AS DATE), o.operation_type, o.warehouse_code
    ORDER BY op_date, o.operation_type
  `);

  if (byDayRes.recordset.length === 0) {
    console.log('⚠️  ОПЕРАЦИЙ НЕТ! За февраль 2026 ни одной записи в таблице operations.\n');
  } else {
    let totalAei = 0, totalAmount = 0;
    const dates = new Set();
    byDayRes.recordset.forEach(r => {
      dates.add(r.op_date.toISOString ? r.op_date.toISOString().slice(0,10) : String(r.op_date));
      totalAei += r.total_aei || 0;
      totalAmount += r.total_amount || 0;
      const deltaFlag = r.delta > 0.01 ? ' ⚠️  РАСХОЖДЕНИЕ!' : '';
      const rateStr = r.rate != null ? r.rate.toFixed(2) : 'N/A (нет тарифа!)';
      console.log(
        `  ${String(r.op_date).slice(0,10)}  ${String(r.operation_type).padEnd(35)}` +
        `  AEI=${String(r.total_aei).padStart(5)}  rate=${rateStr}  ` +
        `amount=${(r.total_amount||0).toFixed(2).padStart(8)}  ` +
        `expect=${r.expected_amount != null ? r.expected_amount.toFixed(2).padStart(8) : '???'}${deltaFlag}`
      );
    });
    console.log(`\n  Рабочих дней с операциями: ${dates.size}`);
    console.log(`  Всего АЕИ: ${totalAei}`);
    console.log(`  Итого из БД (SUM amount): ${totalAmount.toFixed(2)} руб.`);
    console.log(`  Ожидается:                ${EXPECTED_SALARY.toFixed(2)} руб.`);
    console.log(`  Разница:                  ${(EXPECTED_SALARY - totalAmount).toFixed(2)} руб.\n`);
  }

  // ─── 3. Прямая проверка по дням — есть ли пропуски ──────────────
  console.log('━━━ 3. КОЛИЧЕСТВО ОПЕРАЦИЙ ПО ДНЯМ ФЕВРАЛЯ ━━━');
  const daysRes = await pool.request().query(`
    SELECT 
      CAST(o.operation_date AS DATE) AS op_date,
      COUNT(*) AS ops_count,
      SUM(o.count) AS total_aei,
      SUM(o.amount) AS total_amount
    FROM operations o
    WHERE o.user_id = ${USER_ID}
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
    GROUP BY CAST(o.operation_date AS DATE)
    ORDER BY op_date
  `);

  if (daysRes.recordset.length === 0) {
    console.log('  ❌ Нет записей!\n');
  } else {
    daysRes.recordset.forEach(r => {
      console.log(`  ${String(r.op_date).slice(0,10)}: ${r.ops_count} строк, АЕИ=${r.total_aei}, сумма=${(r.total_amount||0).toFixed(2)}`);
    });
    console.log(`  Итого дней: ${daysRes.recordset.length}\n`);
  }

  // ─── 4. Проверка тарифов для типов операций Канчуриной ──────────
  console.log('━━━ 4. ТАРИФЫ ДЛЯ ТИПОВ ОПЕРАЦИЙ КАНЧУРИНОЙ ━━━');
  const typesRes = await pool.request().query(`
    SELECT DISTINCT o.operation_type, o.warehouse_code
    FROM operations o
    WHERE o.user_id = ${USER_ID}
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
  `);

  for (const row of typesRes.recordset) {
    const tariffRes = await pool.request().query(`
      SELECT warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from, valid_to, is_active
      FROM tariffs
      WHERE (warehouse_code = '${row.warehouse_code}' OR warehouse_code = 'ALL')
        AND operation_type = N'${row.operation_type}'
        AND is_active = 1
      ORDER BY CASE WHEN warehouse_code = '${row.warehouse_code}' THEN 1 ELSE 2 END, valid_from DESC
    `);
    if (tariffRes.recordset.length === 0) {
      console.log(`  ❌ НЕТ ТАРИФА:  ${row.warehouse_code} - ${row.operation_type}`);
    } else {
      const t = tariffRes.recordset[0];
      const validTo = t.valid_to ? t.valid_to.toISOString().slice(0,10) : 'NULL';
      console.log(`  ✅ ${String(row.operation_type).padEnd(35)} rate=${t.rate.toFixed(2)} ₽  (склад=${t.warehouse_code}, valid: ${t.valid_from.toISOString().slice(0,10)} — ${validTo})`);
    }
  }
  console.log('');

  // ─── 5. Сводная итоговая таблица из v_salary_by_month ────────────
  console.log('━━━ 5. ИТОГ ИЗ v_salary_by_month ━━━');
  const monthRes = await pool.request().query(`
    SELECT year, month, total_aei, base_amount, avg_quality_coefficient, total_amount, operations_count
    FROM v_salary_by_month
    WHERE user_id = ${USER_ID} AND year = 2026 AND month = 2
  `);
  if (monthRes.recordset.length === 0) {
    console.log('  ⚠️  В v_salary_by_month записей нет (View пустой)\n');
  } else {
    const m = monthRes.recordset[0];
    console.log(`  Операций: ${m.operations_count}`);
    console.log(`  АЕИ: ${m.total_aei}`);
    console.log(`  База (без Ккач): ${(m.base_amount||0).toFixed(2)}`);
    console.log(`  Ккач (ср.): ${m.avg_quality_coefficient}`);
    console.log(`  Итого (с Ккач): ${(m.total_amount||0).toFixed(2)}`);
    console.log(`  Ожидается: ${EXPECTED_SALARY}`);
    console.log(`  Разница: ${(EXPECTED_SALARY - (m.total_amount||0)).toFixed(2)}\n`);
  }

  // ─── 6. Проверка chunk-логики — количество строк в SAP vs БД ────
  console.log('━━━ 6. СРАВНЕНИЕ: ЧТО В БД vs ЧТО ОЖИДАЕТСЯ ━━━');
  const detailRes = await pool.request().query(`
    SELECT 
      o.operation_type,
      COUNT(*) AS ops_count,
      SUM(o.count) AS total_aei,
      SUM(o.amount) AS total_amount,
      MAX(t.rate) AS tariff_rate,
      SUM(o.count) * MAX(t.rate) AS expected_by_formula,
      -- Проверяем, что amount = count * rate
      SUM(CASE WHEN ABS(o.amount - o.count * COALESCE(t.rate, 0)) > 0.01 THEN 1 ELSE 0 END) AS wrong_amounts
    FROM operations o
    LEFT JOIN tariffs t ON
      (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND o.operation_date >= t.valid_from
      AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
      AND t.is_active = 1
    WHERE o.user_id = ${USER_ID}
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date <  '2026-03-01'
    GROUP BY o.operation_type
    ORDER BY total_amount DESC
  `);

  console.log('  Тип операции                           АЕИ   Rate  В_БД      По_Форм.   Неверн.ст.');
  console.log('  ─────────────────────────────────────────────────────────────────────────────────');
  let grandTotal = 0;
  let grandExpected = 0;
  detailRes.recordset.forEach(r => {
    grandTotal += r.total_amount || 0;
    grandExpected += r.expected_by_formula || 0;
    const wrongFlag = r.wrong_amounts > 0 ? ` ⚠️ ${r.wrong_amounts} неверн.` : '';
    const rate = r.tariff_rate != null ? r.tariff_rate.toFixed(2) : 'N/A';
    console.log(
      `  ${String(r.operation_type).padEnd(38)} ${String(r.total_aei).padStart(5)} ` +
      `${String(rate).padStart(5)}  ${(r.total_amount||0).toFixed(2).padStart(9)}  ` +
      `${(r.expected_by_formula||0).toFixed(2).padStart(9)}${wrongFlag}`
    );
  });
  console.log('  ─────────────────────────────────────────────────────────────────────────────────');
  console.log(`  ИТОГО:                                         сумма в БД: ${grandTotal.toFixed(2)}  ожидаемое: ${grandExpected.toFixed(2)}`);
  console.log(`  Ожидается (из ТЗ): ${EXPECTED_SALARY}`);
  console.log(`  Разница (ТЗ - БД): ${(EXPECTED_SALARY - grandTotal).toFixed(2)}\n`);

  // ─── 7. Проверка salary_summary ──────────────────────────────────
  console.log('━━━ 7. salary_summary ДЛЯ КАНЧУРИНОЙ ━━━');
  const ssRes = await pool.request().query(`
    SELECT id, period_start, period_end, total_amount, quality_coefficient, errors_count
    FROM salary_summary
    WHERE user_id = ${USER_ID}
      AND period_start >= '2026-02-01'
      AND period_start <  '2026-03-01'
  `);
  if (ssRes.recordset.length === 0) {
    console.log('  ℹ️  Записей в salary_summary нет (Ккач = 1.0 по умолчанию)\n');
  } else {
    ssRes.recordset.forEach(r => {
      console.log(`  Период: ${r.period_start.toISOString().slice(0,10)} — ${r.period_end ? r.period_end.toISOString().slice(0,10) : 'NULL'}, Ккач=${r.quality_coefficient}, total=${r.total_amount}`);
    });
    console.log('');
  }

  // ─── 8. Все тарифы активные на февраль 2026 ──────────────────────
  console.log('━━━ 8. ВСЕ АКТИВНЫЕ ТАРИФЫ (ALL) НА ФЕВРАЛЬ 2026 ━━━');
  const tariffAllRes = await pool.request().query(`
    SELECT warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from, valid_to
    FROM tariffs
    WHERE is_active = 1
      AND valid_from <= '2026-02-28'
      AND (valid_to IS NULL OR valid_to >= '2026-02-01')
    ORDER BY warehouse_code, operation_type
  `);
  tariffAllRes.recordset.forEach(t => {
    const validTo = t.valid_to ? t.valid_to.toISOString().slice(0,10) : 'NULL';
    console.log(`  [${t.warehouse_code}] ${String(t.operation_type).padEnd(38)} rate=${t.rate.toFixed(2)}  norm=${t.norm_aei_per_hour}  (${t.valid_from.toISOString().slice(0,10)} — ${validTo})`);
  });
  console.log('');

  // ─── 9. Подозрение: дубли тарифа через JOIN? ─────────────────────
  console.log('━━━ 9. ПРОВЕРКА ЗАДВОЕНИЯ ТАРИФОВ (дубли в v_salary_details) ━━━');
  const dupeCheckRes = await pool.request().query(`
    SELECT operation_id, COUNT(*) AS cnt
    FROM v_salary_details
    WHERE user_id = ${USER_ID}
      AND operation_date >= '2026-02-01'
      AND operation_date <  '2026-03-01'
    GROUP BY operation_id
    HAVING COUNT(*) > 1
  `);
  if (dupeCheckRes.recordset.length === 0) {
    console.log('  ✅ Дублей в v_salary_details нет\n');
  } else {
    console.log(`  ⚠️  НАЙДЕНЫ ДУБЛИ! Строк с дублями: ${dupeCheckRes.recordset.length}`);
    console.log('  Причина: несколько тарифов подходят через LEFT JOIN (warehouse_code AND operation_type)');
    console.log('  Это может привести к УДВОЕНИЮ сумм в Views!\n');
  }

  // ─── 10. Итоговый вывод ──────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ИТОГОВЫЙ ВЫВОД                                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  
  const totalOpsRes = await pool.request().query(`
    SELECT COUNT(*) AS cnt, SUM(amount) AS total
    FROM operations
    WHERE user_id = ${USER_ID}
      AND operation_date >= '2026-02-01'
      AND operation_date < '2026-03-01'
  `);
  const cnt = totalOpsRes.recordset[0].cnt;
  const total = totalOpsRes.recordset[0].total || 0;
  
  console.log(`\n  Строк в operations за февраль: ${cnt}`);
  console.log(`  SUM(amount) в operations:     ${total.toFixed(2)} руб.`);
  console.log(`  Ожидаемая зарплата:           ${EXPECTED_SALARY.toFixed(2)} руб.`);
  console.log(`  Разница:                      ${(EXPECTED_SALARY - total).toFixed(2)} руб.`);
  
  if (cnt === 0) {
    console.log('\n  🔴 ПРОБЛЕМА: Данные за февраль не загружены вообще!');
    console.log('  РЕШЕНИЕ: Запустить синхронизацию SAP за период 2026-02-01 — 2026-02-28');
  } else if (Math.abs(EXPECTED_SALARY - total) > 1) {
    const pct = ((total / EXPECTED_SALARY) * 100).toFixed(1);
    console.log(`\n  🟡 ПРОБЛЕМА: Загружено только ${pct}% от ожидаемой суммы (${total.toFixed(2)} из ${EXPECTED_SALARY})`);
    console.log('  Вероятная причина: не все чанки/дни успешно загружены из SAP.');
    console.log('  РЕШЕНИЕ: Перезапустить syncPeriod для склада Канчуриной за 2026-02-01 — 2026-02-28');
  } else {
    console.log('\n  ✅ Сумма в норме!');
  }
  console.log('');

  await pool.close();
}

main().catch(err => {
  console.error('❌ Ошибка подключения:', err.message);
  process.exit(1);
});
