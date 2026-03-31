/**
 * 1. Удаляем ПМ_Упаковка для всех кроме 6 DEF-сотрудников
 * 2. Проверяем дефицитные операции для 5 сотрудников
 */
const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

// 6 DEF-сотрудников — их ПМ_Упаковка трогать не надо
const DEF_USER_IDS = [566, 560, 570, 558, 598, 596];

async function run() {
  const pool = await sql.connect(cfg);
  console.log('✅ Подключено\n');

  // ── 1. Статистика ПМ_Упаковка перед удалением ──
  const before = await pool.request().query(`
    SELECT u.fio, SUM(o.count) as cnt, SUM(o.amount) as amt
    FROM operations o JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
      AND o.operation_type = N'ПМ_Упаковка'
      AND o.sap_order_id <> 'CORR-DEF-FEB-2026' -- исключаем наши коррекции
      AND o.user_id NOT IN (${DEF_USER_IDS.join(',')}, 530) -- исключаем DEF-сотрудников и Сотрудника 00000000
    GROUP BY u.fio ORDER BY SUM(o.amount) DESC
  `);
  console.log('=== ПМ_Упаковка для УДАЛЕНИЯ (лишние операции) ===');
  let totalToDelete = 0;
  before.recordset.forEach(x => {
    console.log(`  ${x.fio}: ${x.cnt} AEI, ${x.amt.toFixed(2)} руб`);
    totalToDelete += x.amt;
  });
  console.log(`  ИТОГО к удалению: ${totalToDelete.toFixed(2)} руб`);

  // ── 2. Удаляем лишние ПМ_Упаковка ──
  const del = await pool.request().query(`
    DELETE FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND operation_type = N'ПМ_Упаковка'
      AND (sap_order_id <> 'CORR-DEF-FEB-2026' OR sap_order_id IS NULL)
      AND user_id NOT IN (${DEF_USER_IDS.join(',')}, 530)
  `);
  console.log(`\n  🗑️  Удалено строк: ${del.rowsAffected[0]}`);

  // ── 3. Проверяем дефицитных сотрудников ──
  const deficitUsers = {
    'АХУНАЛИ КЫЗЫ ДАМИРА': { ids: [], ref: 45928 },
    'КУЗОВКОВА ОЛЬГА ВЯЧЕСЛАВОВНА': { ids: [], ref: 64577 },
    'ЛУТОШКИН МИХАИЛ ВЯЧЕСЛАВОВИЧ': { ids: [], ref: 35784 },
    'МЕДЕРОВА КАНЫКЕЙ': { ids: [], ref: 42446 },
    'МИСЮЛЯ ЕЛЕНА ИВАНОВНА': { ids: [], ref: 59595 },
  };

  // Get their user IDs
  const uids = await pool.request().query(`
    SELECT id, fio FROM users WHERE fio LIKE N'%АХУНАЛИ%' OR fio LIKE N'%КУЗОВКОВА%'
      OR fio LIKE N'%ЛУТОШКИН%' OR fio LIKE N'%МЕДЕРОВА%' OR fio LIKE N'%МИСЮЛЯ%'
  `);
  uids.recordset.forEach(u => console.log(`  uid=${u.id}: ${u.fio}`));

  console.log('\n=== ДЕФИЦИТНЫЕ СОТРУДНИКИ — детали операций ===');
  for (const row of uids.recordset) {
    const ops = await pool.request().query(`
      SELECT operation_type, SUM(count) as cnt, SUM(amount) as amt
      FROM operations
      WHERE user_id = ${row.id} AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      GROUP BY operation_type ORDER BY operation_type
    `);
    let tot = 0;
    console.log(`\n  ── ${row.fio} ──`);
    ops.recordset.forEach(x => { tot += x.amt; console.log(`    ${x.operation_type}: ${x.cnt} AEI = ${x.amt.toFixed(2)}`); });
    const fioKey = Object.keys(deficitUsers).find(k => row.fio.includes(k.split(' ')[0]));
    const ref = fioKey ? deficitUsers[fioKey].ref : '?';
    console.log(`    ИТОГО: ${tot.toFixed(2)}  (эталон: ${ref}, разница: ${(tot - (typeof ref === 'number' ? ref : 0)).toFixed(2)})`);
  }

  // ── 4. Пересчёт salary_summary для всех затронутых ──
  console.log('\n=== ПЕРЕСЧЁТ salary_summary ===');
  // Получаем всех кто был затронут удалением
  const affected = before.recordset.map(x => x.fio);

  // Получаем их user_id
  const affIds = await pool.request().query(`
    SELECT id FROM users WHERE fio IN (${
      before.recordset.map(x => `N'${x.fio.replace(/'/g, "''")}'`).join(',')
    })
  `);
  const affUserIds = affIds.recordset.map(x => x.id);

  if (affUserIds.length > 0) {
    await pool.request().query(`
      DELETE FROM salary_summary
      WHERE period_start = '2026-02-01' AND user_id IN (${affUserIds.join(',')})
    `);
    const recalc = await pool.request().query(`
      SELECT user_id, SUM(amount) as total
      FROM operations
      WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
        AND user_id IN (${affUserIds.join(',')})
      GROUP BY user_id
    `);
    for (const r of recalc.recordset) {
      await pool.request()
        .input('uid', sql.Int, r.user_id)
        .input('total', sql.Decimal(18,2), r.total)
        .query(`INSERT INTO salary_summary (user_id, period_start, period_end, total_amount, quality_coefficient, errors_count)
                VALUES (@uid, '2026-02-01', '2026-02-28', @total, 1.0, 0)`);
    }
    console.log(`  ✅ Пересчитано ${recalc.recordset.length} записей`);
  }

  const totalRes = await pool.request().query(`SELECT SUM(total_amount) as t FROM salary_summary WHERE period_start = '2026-02-01'`);
  console.log(`\n  Общий фонд после исправления: ${totalRes.recordset[0].t.toFixed(2)}`);

  await pool.close();
  console.log('\n✅ Готово');
}
run().catch(console.error);
