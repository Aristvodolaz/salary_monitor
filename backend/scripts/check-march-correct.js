/**
 * Проверка данных за март 2026:
 * сравнивает текущие значения в БД с эталонными значениями.
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
  connectionTimeout: 30000,
};

// ─── Эталонные данные (правильные суммы) ───────────────────────
const EXPECTED = [
  { fio: 'Мищенков Дмитрий Евгеньевич',          expected: 12090   },
  { fio: 'Надралиев Ермек Бисимбаевич',           expected: 8828.8  },
  { fio: 'Абдумаликов Шомурод Абдумаликович',     expected: 8549.8  },
  { fio: 'Новиков Александр Викторович',           expected: 5735    },
  { fio: 'Бердников Артём Александрович',          expected: 5536.6  },
  { fio: 'Сопов Александр Васильевич',             expected: 4631.4  },
  { fio: 'Долматов Илья Анатольевич',              expected: 3230.2  },
  { fio: 'Федотов Роман Александрович',            expected: 437     },
  { fio: 'Шуменко Александр Александрович',        expected: 14448.6 },
  { fio: 'Иксанов Рафаэль Нафисович',             expected: 14123.6 },
  { fio: 'Захаров Михаил Михайлович',              expected: 16399   },
  { fio: 'Таженов Серик Зейнуллиевич',             expected: 15177.6 },
  { fio: 'Тупелекин Денис Александрович',          expected: 21427.2 },
  { fio: 'Турсунов Акрамжон Мирзомуродович',       expected: 20255.4 },
  { fio: 'Денисов Юрий Васильевич',                expected: 29605   },
  { fio: 'Ахунали кызы Дамира',                    expected: 45927.8 },
  { fio: 'Медерова Каныкей',                       expected: 42445.2 },
  { fio: 'Лутошкин Михаил Вячеславович',           expected: 35785.5 },
  { fio: 'Мисюля Елена Ивановна',                  expected: 59595.7 },
  { fio: 'Кузовкова Ольга Вячеславовна',           expected: 64576.8 },
];

const START_DATE = '2026-03-01';
const END_DATE   = '2026-03-31';

async function main() {
  const pool = await sql.connect(dbConfig);
  console.log('✅ Подключение к БД установлено\n');

  // Получаем текущие данные из БД
  const result = await pool.request()
    .input('startDate', sql.VarChar, START_DATE)
    .input('endDate',   sql.VarChar, END_DATE)
    .query(`
      SELECT
        u.fio,
        u.employee_id,
        ROUND(SUM(sd.base_amount), 2) AS total_amount
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
      GROUP BY u.fio, u.employee_id
      ORDER BY total_amount DESC
    `);

  const dbMap = new Map();
  for (const row of result.recordset) {
    dbMap.set(row.fio.trim(), { amount: parseFloat(row.total_amount), employee_id: row.employee_id });
  }

  console.log(`${'ФИО'.padEnd(45)} ${'Эталон'.padStart(10)} ${'В БД'.padStart(10)} ${'Δ'.padStart(10)} Статус`);
  console.log('─'.repeat(95));

  let totalExpected = 0;
  let totalActual   = 0;
  let mismatches    = 0;
  let missing       = 0;

  for (const { fio, expected } of EXPECTED) {
    const db = dbMap.get(fio);
    const actual = db?.amount ?? null;
    const delta  = actual !== null ? Math.round((actual - expected) * 100) / 100 : null;

    totalExpected += expected;
    if (actual !== null) totalActual += actual;

    let status;
    if (actual === null) {
      status = '❌ НЕТ В БД';
      missing++;
    } else if (Math.abs(delta) < 0.01) {
      status = '✅ OK';
    } else {
      status = `⚠️  РАСХОЖДЕНИЕ`;
      mismatches++;
    }

    const deltaStr = delta !== null ? (delta >= 0 ? `+${delta}` : `${delta}`) : '—';
    console.log(
      `${fio.padEnd(45)} ${String(expected).padStart(10)} ${actual !== null ? String(actual).padStart(10) : '—'.padStart(10)} ${deltaStr.padStart(10)} ${status}`
    );
  }

  console.log('─'.repeat(95));
  console.log(`${'ИТОГО'.padEnd(45)} ${String(Math.round(totalExpected * 100) / 100).padStart(10)} ${String(Math.round(totalActual * 100) / 100).padStart(10)}`);
  console.log();

  // Сотрудники в БД, которых нет в эталоне
  const expectedNames = new Set(EXPECTED.map(e => e.fio));
  const extras = [...dbMap.entries()].filter(([fio]) => !expectedNames.has(fio));
  if (extras.length > 0) {
    console.log(`\n⚠️  Сотрудники в БД, которых нет в эталоне (${extras.length}):`);
    for (const [fio, { amount, employee_id }] of extras) {
      console.log(`  ${fio.padEnd(45)} ${String(amount).padStart(10)}  (employee_id: ${employee_id})`);
    }
  }

  console.log(`\n📊 Итог: расхождений ${mismatches}, отсутствует ${missing}, лишних в БД ${extras.length}`);

  await pool.close();
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
