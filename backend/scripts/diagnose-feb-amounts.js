/**
 * Диагностика расхождений за ФЕВРАЛЬ 2026
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

function normalize(s) {
  return s.toUpperCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  const pool = await sql.connect(dbConfig);
  console.log('Подключение к БД\n');

  // Суммы за февраль
  const salaryResult = await pool.request().query(`
    SELECT
      u.id,
      u.fio,
      u.employee_id,
      w.code as warehouse_code,
      ROUND(SUM(o.amount), 2) AS total_amount,
      COUNT(*) as ops_count
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    LEFT JOIN warehouses w ON u.warehouse_id = w.id
    WHERE o.operation_date >= '2026-02-01'
      AND o.operation_date < '2026-03-01'
    GROUP BY u.id, u.fio, u.employee_id, w.code
    ORDER BY u.fio
  `);

  const dbMap = new Map();
  for (const row of salaryResult.recordset) {
    const key = normalize(row.fio);
    dbMap.set(key, {
      fio: row.fio,
      employee_id: row.employee_id,
      user_id: row.id,
      warehouse_code: row.warehouse_code,
      total_amount: parseFloat(row.total_amount),
      ops_count: row.ops_count,
    });
  }

  console.log(`${'ФИО'.padEnd(45)} ${'Эталон'.padStart(10)} ${'В БД'.padStart(12)} ${'Δ'.padStart(10)} ${'Склад'.padStart(6)} ${'Ops'.padStart(5)} Статус`);
  console.log('─'.repeat(105));

  let ok = 0, mismatch = 0, missing = 0;
  const details = [];

  for (const { fio, expected } of EXPECTED) {
    const key = normalize(fio);
    const db = dbMap.get(key);

    if (db) {
      const delta = Math.round((db.total_amount - expected) * 100) / 100;
      const status = Math.abs(delta) < 0.1 ? 'OK' : 'РАСХОЖДЕНИЕ';
      if (Math.abs(delta) < 0.1) ok++; else mismatch++;
      console.log(
        `${fio.padEnd(45)} ${expected.toString().padStart(10)} ${db.total_amount.toString().padStart(12)} ${delta.toString().padStart(10)} ${(db.warehouse_code || '?').padStart(6)} ${db.ops_count.toString().padStart(5)} ${status}`
      );
      if (Math.abs(delta) >= 0.1) {
        details.push({ fio, expected, db });
      }
    } else {
      missing++;
      console.log(`${fio.padEnd(45)} ${expected.toString().padStart(10)} ${'НЕТ В БД'.padStart(12)} ${'—'.padStart(10)}`);
    }
  }

  console.log(`\nИтого: OK=${ok}, расхождений=${mismatch}, нет в БД=${missing}`);

  // Детали для расхождений
  if (details.length > 0) {
    console.log('\n═══ ДЕТАЛИ РАСХОЖДЕНИЙ ═══');
    for (const { fio, expected, db } of details) {
      console.log(`\n▶ ${fio} (${db.employee_id}, склад ${db.warehouse_code})`);
      console.log(`  Эталон: ${expected}, В БД: ${db.total_amount}, Δ: ${Math.round((db.total_amount - expected) * 100) / 100}`);

      const opsResult = await pool.request()
        .input('userId', sql.Int, db.user_id)
        .query(`
          SELECT
            operation_type,
            COUNT(*) as cnt,
            SUM([count]) as total_aei,
            ROUND(SUM(amount), 2) as total_amount,
            MIN(operation_date) as first_date,
            MAX(operation_date) as last_date
          FROM operations
          WHERE user_id = @userId
            AND operation_date >= '2026-02-01'
            AND operation_date < '2026-03-01'
          GROUP BY operation_type
          ORDER BY total_amount DESC
        `);

      console.log(`  ${'Тип операции'.padEnd(30)} ${'Кол-во'.padStart(8)} ${'АЕИ'.padStart(10)} ${'Сумма'.padStart(12)}`);
      for (const row of opsResult.recordset) {
        console.log(
          `  ${(row.operation_type || 'NULL').padEnd(30)} ${row.cnt.toString().padStart(8)} ${parseFloat(row.total_aei).toString().padStart(10)} ${parseFloat(row.total_amount).toString().padStart(12)}`
        );
      }
    }
  }

  await pool.close();
}

main().catch(err => { console.error(err); process.exit(1); });
