/**
 * ИСПРАВЛЕНИЕ ФЕВРАЛЬ 2026:
 * 1. Добавить ПМ_Упаковка (DEF) для 6 сотрудников (эталонные значения)
 * 2. Исправить Дмитриев: 385 AEI МС_Штучная → М3_Штучная
 * 3. Пересчитать salary_summary
 */
const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

const PERIOD_DATE = '2026-02-28'; // Дата для коррекционных строк (конец февраля)

// Эталонные DEF операции
const defCorrections = [
  { userId: 566, name: 'ЕВСТИГНЕЕВА',  aei: 13573, rate: 4.3 },
  { userId: 560, name: 'КАНИЩЕВА',     aei: 10417, rate: 4.3 },
  { userId: 570, name: 'ЛОГИНОВСКАЯ',  aei: 13483, rate: 4.3 },
  { userId: 558, name: 'МАЛИНИНА',     aei: 14596, rate: 4.3 },
  { userId: 598, name: 'МИЛЛЕР',       aei:  2502, rate: 4.3 },
  { userId: 596, name: 'НЕСТЕРЕНКО',   aei: 13396, rate: 4.3 },
];

async function run() {
  const pool = await sql.connect(cfg);
  console.log('✅ Подключено к БД\n');

  // ──────────────────────────────────────────────────────────
  // 1. DEF / ПМ_Упаковка для 6 сотрудников
  // ──────────────────────────────────────────────────────────
  console.log('━━━ 1. ДОБАВЛЕНИЕ ПМ_Упаковка (DEF) ━━━');

  // Получаем warehouse_code для каждого пользователя
  const whRes = await pool.request().query(`
    SELECT u.id, w.code as wh_code
    FROM users u
    JOIN warehouses w ON w.id = u.warehouse_id
    WHERE u.id IN (566, 560, 570, 558, 598, 596)
  `);
  const whMap = new Map(whRes.recordset.map(r => [r.id, r.wh_code]));

  for (const corr of defCorrections) {
    const amount = corr.aei * corr.rate;
    const whCode = whMap.get(corr.userId) || '02DQ';

    // Проверяем не добавлено ли уже
    const exists = await pool.request()
      .input('uid', sql.Int, corr.userId)
      .query(`SELECT COUNT(*) as cnt FROM operations
              WHERE user_id = @uid AND sap_order_id = 'CORR-DEF-FEB-2026'
              AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'`);
    if (exists.recordset[0].cnt > 0) {
      console.log(`  ⏭️  ${corr.name}: уже исправлено — пропускаем`);
      continue;
    }

    await pool.request()
      .input('uid',    sql.Int,         corr.userId)
      .input('wh',     sql.VarChar(10),  whCode)
      .input('otype',  sql.NVarChar(100), 'ПМ_Упаковка')
      .input('area',   sql.NVarChar(50),  'ПМ')
      .input('cnt',    sql.Int,           corr.aei)
      .input('act',    sql.Float,         0)
      .input('dt',     sql.Date,          new Date(PERIOD_DATE))
      .input('amt',    sql.Decimal(18,2),  amount)
      .input('sapid',  sql.VarChar(50),   'CORR-DEF-FEB-2026')
      .input('wcrc',   sql.NVarChar(20),  'DEF')
      .query(`
        INSERT INTO operations
          (user_id, warehouse_code, operation_type, participant_area, count, actdura,
           operation_date, amount, sap_order_id, wcr_code)
        VALUES
          (@uid, @wh, @otype, @area, @cnt, @act, @dt, @amt, @sapid, @wcrc)
      `);
    console.log(`  ✅ ${corr.name}: +${corr.aei} AEI → ${amount.toFixed(2)} руб`);
  }

  // ──────────────────────────────────────────────────────────
  // 2. Дмитриев: МС_Штучная 3675 → 3290 + М3_Штучная 385
  // ──────────────────────────────────────────────────────────
  console.log('\n━━━ 2. ИСПРАВЛЕНИЕ ДМИТРИЕВ (МС_Штучная → М3_Штучная) ━━━');

  // Проверяем текущее состояние
  const dmCheck = await pool.request().query(`
    SELECT operation_type, SUM(count) as cnt, SUM(amount) as amt
    FROM operations
    WHERE user_id = 536
      AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND operation_type IN (N'МС_Штучная комплектация', N'М3_Штучная комплектация')
    GROUP BY operation_type
  `);
  console.log('  Текущее состояние:');
  dmCheck.recordset.forEach(x => console.log(`    ${x.operation_type}: ${x.cnt} AEI = ${x.amt.toFixed(2)} руб`));

  const mcRow  = dmCheck.recordset.find(x => x.operation_type === 'МС_Штучная комплектация');
  const m3Row  = dmCheck.recordset.find(x => x.operation_type === 'М3_Штучная комплектация');
  const curMC  = mcRow  ? mcRow.cnt  : 0;
  const cur3   = m3Row  ? m3Row.cnt  : 0;
  const TARGET_MC = 3290; // эталон
  const TARGET_M3 = 385;  // эталон (PS3L)
  const excess = curMC - TARGET_MC;  // сколько лишних МС_Штучная

  console.log(`  МС_Штучная: текущий=${curMC}, эталон=${TARGET_MC}, избыток=${excess}`);
  console.log(`  М3_Штучная: текущий=${cur3},  эталон=${TARGET_M3}`);

  // Проверяем не исправлено ли уже
  const dmFixExists = await pool.request().query(`
    SELECT COUNT(*) as cnt FROM operations
    WHERE user_id = 536 AND sap_order_id = 'CORR-DM-FEB-2026'
  `);
  if (dmFixExists.recordset[0].cnt > 0) {
    console.log('  ⏭️  Уже исправлено — пропускаем');
  } else if (excess > 0 && cur3 < TARGET_M3) {
    const whCode = whMap.get(536) || '02DQ';
    // Удаляем строки МС_Штучная в порядке убывания sap_order_id пока не достигнем TARGET_MC
    const rowsMC = await pool.request().query(`
      SELECT TOP 200 id, count
      FROM operations
      WHERE user_id = 536 AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
        AND operation_type = N'МС_Штучная комплектация'
      ORDER BY sap_order_id DESC, id DESC
    `);
    let toDelete = excess;
    const deleteIds = [];
    let leftover = 0;
    for (const row of rowsMC.recordset) {
      if (toDelete <= 0) break;
      if (row.count <= toDelete) {
        deleteIds.push(row.id);
        toDelete -= row.count;
      } else {
        // Нужно частично удалить эту строку (оставить row.count - toDelete)
        leftover = row.count - toDelete;
        deleteIds.push(row.id);
        toDelete = 0;
      }
    }
    if (deleteIds.length > 0) {
      await pool.request().query(`DELETE FROM operations WHERE id IN (${deleteIds.join(',')})`);
      console.log(`  🗑️  Удалено ${deleteIds.length} строк МС_Штучная`);
    }
    // Если было частичное удаление — вставляем остаток
    if (leftover > 0) {
      await pool.request()
        .input('uid',   sql.Int,          536)
        .input('wh',    sql.VarChar(10),   '02DQ')
        .input('otype', sql.NVarChar(100), 'МС_Штучная комплектация')
        .input('area',  sql.NVarChar(50),  'МС')
        .input('cnt',   sql.Int,           leftover)
        .input('act',   sql.Float,         0)
        .input('dt',    sql.Date,          new Date(PERIOD_DATE))
        .input('amt',   sql.Decimal(18,2), leftover * 1.7)
        .input('sapid', sql.VarChar(50),   'CORR-DM-FEB-2026')
        .query(`INSERT INTO operations (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id)
                VALUES (@uid, @wh, @otype, @area, @cnt, @act, @dt, @amt, @sapid)`);
      console.log(`  ↩️  Вставлен остаток МС_Штучная: ${leftover} AEI`);
    }
    // Добавляем М3_Штучная correction
    const need3 = TARGET_M3 - cur3;
    if (need3 > 0) {
      const wh536 = whMap.get(536) || '02DQ';
      await pool.request()
        .input('uid',   sql.Int,          536)
        .input('wh',    sql.VarChar(10),   wh536)
        .input('otype', sql.NVarChar(100), 'М3_Штучная комплектация')
        .input('area',  sql.NVarChar(50),  'М3')
        .input('cnt',   sql.Int,           need3)
        .input('act',   sql.Float,         0)
        .input('dt',    sql.Date,          new Date(PERIOD_DATE))
        .input('amt',   sql.Decimal(18,2), need3 * 7.2)
        .input('sapid', sql.VarChar(50),   'CORR-DM-FEB-2026')
        .query(`INSERT INTO operations (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id)
                VALUES (@uid, @wh, @otype, @area, @cnt, @act, @dt, @amt, @sapid)`);
      console.log(`  ✅ Добавлено М3_Штучная: +${need3} AEI → ${(need3 * 7.2).toFixed(2)} руб`);
    }
  } else {
    console.log('  ℹ️  Дмитриев не требует исправления (уже верно)');
  }

  // ──────────────────────────────────────────────────────────
  // 3. Пересчёт salary_summary за февраль
  // ──────────────────────────────────────────────────────────
  console.log('\n━━━ 3. ПЕРЕСЧЁТ salary_summary (февраль 2026) ━━━');

  // Удаляем только исправленные записи
  const affectedUsers = [566, 560, 570, 558, 598, 596, 536];
  await pool.request().query(`
    DELETE FROM salary_summary
    WHERE period_start = '2026-02-01'
      AND user_id IN (${affectedUsers.join(',')})
  `);
  console.log(`  🗑️  Удалено ${affectedUsers.length} старых записей salary_summary`);

  // Вставляем пересчитанные
  const recalc = await pool.request().query(`
    SELECT user_id, SUM(amount) as total
    FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND user_id IN (${affectedUsers.join(',')})
    GROUP BY user_id
  `);
  for (const row of recalc.recordset) {
    await pool.request()
      .input('uid',   sql.Int,         row.user_id)
      .input('total', sql.Decimal(18,2), row.total)
      .query(`
        INSERT INTO salary_summary (user_id, period_start, period_end, total_amount, quality_coefficient, errors_count)
        VALUES (@uid, '2026-02-01', '2026-02-28', @total, 1.0, 0)
      `);
    console.log(`  ✅ user_id=${row.user_id}: ${row.total.toFixed(2)} руб`);
  }

  // ──────────────────────────────────────────────────────────
  // 4. Итоговая проверка
  // ──────────────────────────────────────────────────────────
  console.log('\n━━━ 4. ИТОГОВАЯ ПРОВЕРКА ━━━');

  const check = await pool.request().query(`
    SELECT u.fio, ss.total_amount
    FROM salary_summary ss JOIN users u ON u.id = ss.user_id
    WHERE ss.period_start = '2026-02-01'
      AND ss.user_id IN (566,560,570,558,598,596,536)
    ORDER BY ss.total_amount DESC
  `);

  check.recordset.forEach(x => {
    console.log(`  ${x.fio}: ${x.total_amount.toFixed(2)}`);
  });

  const totalRes = await pool.request().query(`
    SELECT SUM(total_amount) as total FROM salary_summary WHERE period_start = '2026-02-01'
  `);
  console.log('\n  Общий фонд февраль: ' + totalRes.recordset[0].total.toFixed(2));

  await pool.close();
  console.log('\n✅ Готово');
}
run().catch(console.error);
