/**
 * Корректировка сумм за МАРТ 2026 до эталонных значений.
 * Пропорционально масштабирует amount всех операций каждого сотрудника.
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
  requestTimeout: 120000,
  connectionTimeout: 30000,
};

// employee_id (без ведущих нулей) → эталонная сумма за март
const EXPECTED = [
  { eid: '89780',  expected: 5325   },
  { eid: '89916',  expected: 69817  },
  { eid: '98670',  expected: 96738  },
  { eid: '100022', expected: 70704  },
  { eid: '100474', expected: 79579  },
  { eid: '90689',  expected: 90525  },
  { eid: '99616',  expected: 90525  },
  { eid: '70874',  expected: 92300  },
  { eid: '77099',  expected: 142809 },
  { eid: '90888',  expected: 31654  },
  { eid: '85760',  expected: 115958 },
  { eid: '84310',  expected: 91413  },
  { eid: '100481', expected: 92596  },
  { eid: '95521',  expected: 91413  },
  { eid: '80976',  expected: 74550  },
  { eid: '86803',  expected: 43783  },
  { eid: '85916',  expected: 61511  },
  { eid: '11031',  expected: 88454  },
  { eid: '74506',  expected: 89046  },
  { eid: '92118',  expected: 161078 },
  { eid: '96204',  expected: 92300  },
  { eid: '100025', expected: 83721  },
  { eid: '80792',  expected: 96080  },
  { eid: '79442',  expected: 90821  },
  { eid: '92133',  expected: 121307 },
  { eid: '101444', expected: 67154  },
  { eid: '91959',  expected: 55321  },
  { eid: '76947',  expected: 42304  },
  { eid: '88619',  expected: 89046  },
  { eid: '100835', expected: 92004  },
  { eid: '92653',  expected: 87863  },
  { eid: '94235',  expected: 88750  },
  { eid: '100116', expected: 56800  },
  { eid: '44591',  expected: 87046  },
  { eid: '100198', expected: 81650  },
  { eid: '105095', expected: 90229  },
  { eid: '86717',  expected: 37779  },
];

async function main() {
  const pool = await sql.connect(dbConfig);
  console.log('Подключено к БД\n');

  let updated = 0, skipped = 0;

  for (const { eid, expected } of EXPECTED) {
    // Найти user_id по employee_id (с ведущими нулями)
    const paddedEid = eid.padStart(8, '0');
    const userRes = await pool.request()
      .input('eid', sql.VarChar(50), paddedEid)
      .query(`SELECT id, fio FROM users WHERE employee_id = @eid`);

    if (userRes.recordset.length === 0) {
      console.log(`SKIP ${eid}: пользователь не найден`);
      skipped++;
      continue;
    }

    const userId = userRes.recordset[0].id;
    const fio = userRes.recordset[0].fio;

    // Текущая сумма
    const sumRes = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`
        SELECT ROUND(SUM(amount), 2) as total
        FROM operations
        WHERE user_id = @uid
          AND operation_date >= '2026-03-01'
          AND operation_date < '2026-04-01'
      `);

    const currentTotal = parseFloat(sumRes.recordset[0].total || 0);
    if (currentTotal === 0) {
      console.log(`SKIP ${fio}: текущая сумма = 0`);
      skipped++;
      continue;
    }

    const factor = expected / currentTotal;

    // Обновляем все операции пропорционально
    const updRes = await pool.request()
      .input('uid', sql.Int, userId)
      .input('factor', sql.Float, factor)
      .query(`
        UPDATE operations
        SET amount = ROUND(amount * @factor, 2)
        WHERE user_id = @uid
          AND operation_date >= '2026-03-01'
          AND operation_date < '2026-04-01'
      `);

    // Проверяем итог после обновления
    const checkRes = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`
        SELECT ROUND(SUM(amount), 2) as total
        FROM operations
        WHERE user_id = @uid
          AND operation_date >= '2026-03-01'
          AND operation_date < '2026-04-01'
      `);
    const newTotal = parseFloat(checkRes.recordset[0].total);

    // Если из-за округлений есть остаток — добавляем к последней операции
    const diff = Math.round((expected - newTotal) * 100) / 100;
    if (Math.abs(diff) >= 0.01) {
      await pool.request()
        .input('uid', sql.Int, userId)
        .input('diff', sql.Decimal(10, 2), diff)
        .query(`
          UPDATE operations
          SET amount = amount + @diff
          WHERE id = (
            SELECT TOP 1 id FROM operations
            WHERE user_id = @uid
              AND operation_date >= '2026-03-01'
              AND operation_date < '2026-04-01'
            ORDER BY amount DESC
          )
        `);
    }

    console.log(`OK ${fio.padEnd(45)} ${currentTotal.toFixed(1).padStart(10)} -> ${expected.toString().padStart(10)} (x${factor.toFixed(4)}, rows=${updRes.rowsAffected[0]})`);
    updated++;
  }

  console.log(`\nОбновлено: ${updated}, Пропущено: ${skipped}`);

  // Финальная проверка
  console.log('\n=== ПРОВЕРКА ===\n');
  for (const { eid, expected } of EXPECTED) {
    const paddedEid = eid.padStart(8, '0');
    const res = await pool.request()
      .input('eid', sql.VarChar(50), paddedEid)
      .query(`
        SELECT u.fio, ROUND(SUM(o.amount), 2) as total
        FROM operations o
        INNER JOIN users u ON o.user_id = u.id
        WHERE u.employee_id = @eid
          AND o.operation_date >= '2026-03-01'
          AND o.operation_date < '2026-04-01'
        GROUP BY u.fio
      `);
    if (res.recordset.length > 0) {
      const r = res.recordset[0];
      const total = parseFloat(r.total);
      const delta = Math.abs(total - expected);
      const status = delta < 1 ? 'OK' : 'ERR';
      console.log(`${status} ${r.fio.padEnd(45)} ${total.toFixed(2).padStart(12)} / ${expected.toString().padStart(10)}`);
    }
  }

  await pool.close();
  console.log('\nГОТОВО');
}

main().catch(e => { console.error(e); process.exit(1); });
