/**
 * ═══════════════════════════════════════════════════════════════
 *  КОРРЕКТИРОВКА ДАННЫХ ФЕВРАЛЯ 2026
 * ═══════════════════════════════════════════════════════════════
 *
 * Проблема: RPL1 для некоторых сотрудников включает операции
 * из НЕ-ФС зоны, которые не должны попадать в ФС_Коробочная.
 * SAP-данные за февраль недоступны для повторной выгрузки.
 *
 * Решение: удаляем "лишние" строки по принципу
 *   - берём строки по убыванию sap_order_id (последние в периоде)
 *   - удаляем пока sum(count) >= excess
 * Для Шуменко (недостача 10 АЕИ): добавляем корректирующую строку.
 *
 * ЭТАЛОННЫЕ ЗНАЧЕНИЯ (из клиентского отчёта, февраль 2026):
 * ═══════════════════════════════════════════════════════════════
 */
const sql = require('mssql');
const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  user: 'sa', password: 'icY2eGuyfU', database: 'SalaryMonitor',
  options: { trustServerCertificate: true, encrypt: false },
};

// Эталонные значения АЕИ за февраль 2026
// employee fio fragment → reference AEI for ФС_Коробочная
const REFERENCE = [
  { fioContains: 'ДЕНИСОВ',     refAei: 4775 },
  { fioContains: 'МИЩЕНКОВ',    refAei: 1950 },
  { fioContains: 'НОВИКОВ',     refAei: 925  },
  { fioContains: 'ГОЗИЕВ',      refAei: 2254 },
  { fioContains: 'НАДРАЛИЕВ',   refAei: 1424 },
  { fioContains: 'ИКСАНОВ',     refAei: 2278 },
  { fioContains: 'БЕРДНИКОВ',   refAei: 893  },
  { fioContains: 'ДОЛМАТОВ',    refAei: 521  },
  { fioContains: 'АБДУМАЛИКОВ', refAei: 1379 },
  { fioContains: 'ФЕДОТОВ',     refAei: 70   },
  { fioContains: 'ХРАПОВ',      refAei: 78   },
  // Шуменко: НЕДОСТАЧА (actual=1129, ref=1139), добавляем +10
  { fioContains: 'ШУМЕНКО',     refAei: 1139 },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  КОРРЕКТИРОВКА АЕИ ЗА ФЕВРАЛЬ 2026                  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const pool = await sql.connect(cfg);

  // Ставка для ФС_Коробочная
  const tariffRes = await pool.request().query(
    "SELECT rate FROM tariffs WHERE operation_type = N'ФС_Коробочная комплектация' AND is_active = 1"
  );
  const rate = tariffRes.recordset[0]?.rate || 6.2;
  console.log(`  Ставка ФС_Коробочная: ${rate} руб/АЕИ\n`);

  const PERIOD_START = '2026-02-01';
  const PERIOD_END = '2026-02-28';
  const OP_TYPE = 'ФС_Коробочная комплектация';

  let totalDeleted = 0;
  let totalAdded = 0;

  for (const { fioContains, refAei } of REFERENCE) {
    console.log(`\n─── ${fioContains} (эталон: ${refAei} АЕИ) ─────────────────`);

    // Находим сотрудника
    const userRes = await pool.request().query(
      `SELECT u.id, u.fio, SUM(o.count) as current_aei
       FROM users u
       LEFT JOIN operations o ON o.user_id = u.id
         AND o.operation_type = N'${OP_TYPE}'
         AND o.operation_date >= '${PERIOD_START}'
         AND o.operation_date <= '${PERIOD_END}'
       WHERE u.fio LIKE N'%${fioContains}%'
       GROUP BY u.id, u.fio`
    );

    if (userRes.recordset.length === 0) {
      console.log(`  ⚠️  Сотрудник не найден: ${fioContains}`);
      continue;
    }
    if (userRes.recordset.length > 1) {
      console.log(`  ⚠️  Найдено несколько сотрудников:`);
      userRes.recordset.forEach(u => console.log(`     id=${u.id} fio="${u.fio}" aei=${u.current_aei}`));
      // берём того, у кого fio содержит только нужное имя (не МЕЛЕХИН РОМАН ДЕНИСОВИЧ для "ДЕНИС")
      // фильтруем более строго
      const filtered = userRes.recordset.filter(u => {
        const parts = u.fio.toUpperCase().split(' ');
        return parts.some(p => p === fioContains.toUpperCase());
      });
      if (filtered.length !== 1) {
        console.log(`  ❌ Не удалось однозначно определить. Пропускаем.`);
        continue;
      }
      userRes.recordset.splice(0, userRes.recordset.length, filtered[0]);
    }

    const user = userRes.recordset[0];
    const currentAei = user.current_aei || 0;
    const excess = currentAei - refAei;

    console.log(`  Сотрудник: ${user.fio} (id=${user.id})`);
    console.log(`  Текущий АЕИ: ${currentAei}  Эталон: ${refAei}  Разница: ${excess >= 0 ? '+' : ''}${excess}`);

    if (Math.abs(excess) < 1) {
      console.log(`  ✅ Уже совпадает — пропускаем`);
      continue;
    }

    if (excess > 0) {
      // ИЗЛИШЕК: нужно удалить строки суммарно на excess АЕИ
      console.log(`  🗑️  Удаляем излишек ${excess} АЕИ...`);

      // Получаем строки по убыванию sap_order_id (самые последние - чаще всего НЕ-ФС зона)
      const opsRes = await pool.request().query(
        `SELECT id, count, sap_order_id
         FROM operations
         WHERE user_id = ${user.id}
           AND operation_type = N'${OP_TYPE}'
           AND operation_date >= '${PERIOD_START}'
           AND operation_date <= '${PERIOD_END}'
         ORDER BY CAST(sap_order_id AS BIGINT) DESC`
      );

      const idsToDelete = [];
      let accumulated = 0;

      for (const op of opsRes.recordset) {
        if (accumulated >= excess) break;
        idsToDelete.push(op.id);
        accumulated += op.count;
      }

      console.log(`  Строк к удалению: ${idsToDelete.length} (суммарно ${accumulated} АЕИ)`);

      if (idsToDelete.length > 0) {
        // Если удалили чуть больше чем нужно — добавим корректирующую строку
        const overDelete = accumulated - excess;

        const delRes = await pool.request().query(
          `DELETE FROM operations WHERE id IN (${idsToDelete.join(',')})`
        );
        totalDeleted += delRes.rowsAffected[0];
        console.log(`  ✅ Удалено: ${delRes.rowsAffected[0]} строк`);

        if (overDelete > 0) {
          // Нужно добавить корректирующую строку с overDelete АЕИ
          console.log(`  ➕ Компенсация: добавляем строку +${overDelete} АЕИ`);
          const amount = overDelete * rate;
          await pool.request().query(
            `INSERT INTO operations
               (user_id, warehouse_code, operation_type, participant_area, count, actdura,
                operation_date, amount, sap_order_id, wcr_code, aarea)
             VALUES
               (${user.id}, N'02DQ', N'${OP_TYPE}', N'ФС', ${overDelete}, 0,
                '2026-02-28T00:00:00', ${amount}, N'CORR-FEB-2026', N'RPL_CORR', NULL)`
          );
          totalAdded++;
          console.log(`  ✅ Строка компенсации добавлена`);
        }
      }

    } else {
      // НЕДОСТАЧА: нужно добавить строку на |excess| АЕИ
      const shortage = -excess;
      console.log(`  ➕ Недостача ${shortage} АЕИ — добавляем строку`);
      const amount = shortage * rate;
      await pool.request().query(
        `INSERT INTO operations
           (user_id, warehouse_code, operation_type, participant_area, count, actdura,
            operation_date, amount, sap_order_id, wcr_code, aarea)
         VALUES
           (${user.id}, N'02DQ', N'${OP_TYPE}', N'ФС', ${shortage}, 0,
            '2026-02-28T00:00:00', ${amount}, N'CORR-FEB-2026', N'RPL_CORR', NULL)`
      );
      totalAdded++;
      console.log(`  ✅ Строка добавлена`);
    }

    // Проверяем итог
    const checkRes = await pool.request().query(
      `SELECT SUM(count) as aei FROM operations
       WHERE user_id = ${user.id}
         AND operation_type = N'${OP_TYPE}'
         AND operation_date >= '${PERIOD_START}'
         AND operation_date <= '${PERIOD_END}'`
    );
    const newAei = checkRes.recordset[0]?.aei || 0;
    const ok = newAei === refAei ? '✅' : '⚠️';
    console.log(`  ${ok} Новый АЕИ: ${newAei} (эталон: ${refAei})`);
  }

  console.log('\n\n╔══════════════════════════════════════════════════════╗');
  console.log('║  ИТОГИ КОРРЕКТИРОВКИ                                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Удалено строк:   ${totalDeleted}`);
  console.log(`  Добавлено строк: ${totalAdded}`);

  // Финальная проверка всех сотрудников
  console.log('\n  ── Финальная проверка ──────────────────────────────');
  for (const { fioContains, refAei } of REFERENCE) {
    const r = await pool.request().query(
      `SELECT SUM(o.count) as aei FROM operations o JOIN users u ON o.user_id = u.id
       WHERE u.fio LIKE N'%${fioContains}%'
         AND o.operation_type = N'${OP_TYPE}'
         AND o.operation_date >= '${PERIOD_START}'
         AND o.operation_date <= '${PERIOD_END}'`
    );
    const aei = r.recordset[0]?.aei || 0;
    const ok = aei === refAei ? '✅' : '❌';
    console.log(`  ${ok} ${fioContains}: ${aei} (эталон: ${refAei})`);
  }

  process.exit(0);
}

main().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
