/**
 * Исправление: PS3L операции, захваченные как МС_Штучная → М3_Штучная
 * Для 5 сотрудников: Лутошкин, Мисюля, Кузовкова, Ахунали, Медерова
 */
const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

const RATE_MC = 1.7;  // МС_Штучная
const RATE_M3 = 7.2;  // М3_Штучная

// userId: сколько AEI перевести из МС_Штучная в М3_Штучная
const FIXES = [
  { userId: 531, name: 'ЛУТОШКИН',  excess: 259 }, // МС_Штучная 1211→952, М3 192+259=451
  { userId: 559, name: 'МИСЮЛЯ',    excess:  51 }, // МС_Штучная 16658→16607, М3 0+51=51
  { userId: 575, name: 'КУЗОВКОВА', excess:  35 }, // МС_Штучная 17827→17792, М3 0+35=35
  { userId: 541, name: 'АХУНАЛИ',   excess:  14 }, // МС_Штучная 14→0, М3 5653+14=5667
  { userId: 569, name: 'МЕДЕРОВА',  excess:  50 }, // МС_Штучная 11800→11750, М3 0+50=50
];

async function run() {
  const pool = await sql.connect(cfg);
  console.log('✅ Подключено\n');

  for (const fix of FIXES) {
    // Проверяем не исправлено ли уже
    const exists = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM operations
      WHERE user_id = ${fix.userId} AND sap_order_id = 'CORR-PS3L-FEB-2026'
    `);
    if (exists.recordset[0].cnt > 0) {
      console.log(`  ⏭️  ${fix.name}: уже исправлено`);
      continue;
    }

    // Получаем МС_Штучная строки в порядке убывания, удаляем лишние
    const rows = await pool.request().query(`
      SELECT TOP 100 id, count FROM operations
      WHERE user_id = ${fix.userId}
        AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
        AND operation_type = N'МС_Штучная комплектация'
      ORDER BY id DESC
    `);

    let toRemove = fix.excess;
    const toDeleteIds = [];
    let leftover = 0;

    for (const row of rows.recordset) {
      if (toRemove <= 0) break;
      if (row.count <= toRemove) {
        toDeleteIds.push(row.id);
        toRemove -= row.count;
      } else {
        // Частичное удаление этой строки
        leftover = row.count - toRemove;
        toDeleteIds.push(row.id);
        toRemove = 0;
      }
    }

    if (toDeleteIds.length > 0) {
      await pool.request().query(`DELETE FROM operations WHERE id IN (${toDeleteIds.join(',')})`);
    }

    // Вставляем остаток МС_Штучная если было частичное удаление
    if (leftover > 0) {
      await pool.request()
        .input('uid', sql.Int, fix.userId)
        .input('cnt', sql.Int, leftover)
        .input('amt', sql.Decimal(18,2), leftover * RATE_MC)
        .query(`INSERT INTO operations (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id)
                VALUES (@uid, '02DQ', N'МС_Штучная комплектация', N'МС', @cnt, 0, '2026-02-28', @amt, 'CORR-PS3L-FEB-2026')`);
    }

    // Добавляем М3_Штучная
    const m3Amt = fix.excess * RATE_M3;
    await pool.request()
      .input('uid', sql.Int, fix.userId)
      .input('cnt', sql.Int, fix.excess)
      .input('amt', sql.Decimal(18,2), m3Amt)
      .query(`INSERT INTO operations (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id)
              VALUES (@uid, '02DQ', N'М3_Штучная комплектация', N'М3', @cnt, 0, '2026-02-28', @amt, 'CORR-PS3L-FEB-2026')`);

    const netChange = m3Amt - (fix.excess * RATE_MC);
    console.log(`  ✅ ${fix.name}: -${fix.excess} МС_Штучная (${(fix.excess*RATE_MC).toFixed(2)}) +${fix.excess} М3_Штучная (${m3Amt.toFixed(2)}) → Δ=+${netChange.toFixed(2)}`);
  }

  // Пересчёт salary_summary
  console.log('\n=== ПЕРЕСЧЁТ salary_summary ===');
  const uids = FIXES.map(f => f.userId).join(',');
  await pool.request().query(`DELETE FROM salary_summary WHERE period_start = '2026-02-01' AND user_id IN (${uids})`);
  const recalc = await pool.request().query(`
    SELECT user_id, SUM(amount) as total FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01' AND user_id IN (${uids})
    GROUP BY user_id
  `);
  for (const r of recalc.recordset) {
    await pool.request()
      .input('uid', sql.Int, r.user_id)
      .input('total', sql.Decimal(18,2), r.total)
      .query(`INSERT INTO salary_summary (user_id, period_start, period_end, total_amount, quality_coefficient, errors_count)
              VALUES (@uid, '2026-02-01', '2026-02-28', @total, 1.0, 0)`);
    const fix = FIXES.find(f => f.user_id === r.user_id);
  }

  // Итоговая проверка
  console.log('\n=== ИТОГОВАЯ ПРОВЕРКА ===');
  const refs = { 531: 35784, 559: 59595, 575: 64577, 541: 45928, 569: 42446 };
  const check = await pool.request().query(`
    SELECT u.fio, ss.total_amount, ss.user_id
    FROM salary_summary ss JOIN users u ON u.id = ss.user_id
    WHERE ss.period_start = '2026-02-01' AND ss.user_id IN (${uids})
  `);
  check.recordset.forEach(x => {
    const ref = refs[x.user_id];
    const diff = x.total_amount - ref;
    const ok = Math.abs(diff) <= 3 ? '✅' : '❌';
    console.log(`  ${ok} ${x.fio}: ${x.total_amount.toFixed(2)} (эталон: ${ref}, Δ=${diff.toFixed(2)})`);
  });

  const totalRes = await pool.request().query(`SELECT SUM(total_amount) as t FROM salary_summary WHERE period_start = '2026-02-01'`);
  console.log(`\n  Общий фонд: ${totalRes.recordset[0].t.toFixed(2)}`);

  await pool.close();
  console.log('\n✅ Готово');
}
run().catch(console.error);
