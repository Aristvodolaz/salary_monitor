const sql = require('mssql');
const cfg = { 
  server: 'PRM-SRV-MSSQL-01.komus.net', 
  port: 59587, 
  user: 'sa', 
  password: 'icY2eGuyfU', 
  database: 'SalaryMonitor', 
  options: { trustServerCertificate: true, encrypt: false } 
};

// Эталонные данные из Excel (февраль 2026)
const excelData = [
  { fio: 'Мищенков Дмитрий Евгеньевич', expected: 12090 },
  { fio: 'Надралиев Ермек Бисимбаевич', expected: 8828.8 },
  { fio: 'Абдумаликов Шомурод Абдумаликович', expected: 8549.8 },
  { fio: 'Новиков Александр Викторович', expected: 5735 },
  { fio: 'Бердников Артём Александрович', expected: 5536.6 },
  { fio: 'Сопов Александр Васильевич', expected: 4631.4 },
  { fio: 'Долматов Илья Анатольевич', expected: 3230.2 },
  { fio: 'Федотов Роман Александрович', expected: 437 },
  { fio: 'Шуменко Александр Александрович', expected: 14448.6 },
  { fio: 'Иксанов Рафаэль Нафисович', expected: 14123.6 },
  { fio: 'Захаров Михаил Михайлович', expected: 16399 },
  { fio: 'Таженов Серик Зейнуллиевич', expected: 15177.6 },
  { fio: 'Тупелекин Денис Александрович', expected: 21427.2 },
  { fio: 'Турсунов Акрамжон Мирзомуродович', expected: 20255.4 },
  { fio: 'Денисов Юрий Васильевич', expected: 29605 },
  { fio: 'Ахунали кызы Дамира', expected: 45927.8 },
  { fio: 'Медерова Каныкей', expected: 42445.2 },
  { fio: 'Лутошкин Михаил Вячеславович', expected: 35785.5 },
  { fio: 'Мисюля Елена Ивановна', expected: 59595.7 },
  { fio: 'Кузовкова Ольга Вячеславовна', expected: 64576.8 },
];

async function main() {
  const pool = await sql.connect(cfg);

  console.log('\n=== Сравнение БД с эталонными данными (февраль 2026) ===\n');

  const startDate = '2026-02-01';
  const endDate = '2026-02-28';

  let totalDiff = 0;
  let matchCount = 0;
  let notFoundCount = 0;

  for (const item of excelData) {
    // Ищем сотрудника в БД (пробуем разные варианты написания)
    const result = await pool.request()
      .input('fio1', sql.NVarChar, item.fio.toUpperCase())
      .input('fio2', sql.NVarChar, item.fio.toUpperCase() + ' .')
      .input('fio3', sql.NVarChar, item.fio)
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(`
        SELECT 
          u.fio,
          u.employee_id,
          SUM(o.amount) as total_amount_db
        FROM operations o
        INNER JOIN users u ON o.user_id = u.id
        WHERE (
          UPPER(u.fio) = @fio1 
          OR UPPER(u.fio) = @fio2
          OR u.fio = @fio3
        )
          AND o.operation_date >= @startDate
          AND o.operation_date <= @endDate
        GROUP BY u.fio, u.employee_id
      `);

    if (result.recordset.length === 0) {
      console.log(`❌ ${item.fio}`);
      console.log(`   НЕ НАЙДЕН в БД\n`);
      notFoundCount++;
      continue;
    }

    const emp = result.recordset[0];
    const dbAmount = emp.total_amount_db || 0;
    const diff = dbAmount - item.expected;
    const diffPercent = item.expected > 0 ? (diff / item.expected * 100) : 0;

    totalDiff += Math.abs(diff);

    if (Math.abs(diff) < 0.1) {
      console.log(`✅ ${item.fio}`);
      console.log(`   БД: ${dbAmount.toFixed(2)} | Excel: ${item.expected.toFixed(2)} | ✓ СОВПАДАЕТ\n`);
      matchCount++;
    } else {
      console.log(`⚠️  ${item.fio}`);
      console.log(`   БД: ${dbAmount.toFixed(2)} | Excel: ${item.expected.toFixed(2)}`);
      console.log(`   Разница: ${diff.toFixed(2)} руб. (${diffPercent.toFixed(1)}%)\n`);
    }
  }

  console.log('=== Итого ===');
  console.log(`Совпадений: ${matchCount} из ${excelData.length}`);
  console.log(`Не найдено: ${notFoundCount}`);
  console.log(`Расхождений: ${excelData.length - matchCount - notFoundCount}`);
  console.log(`Суммарная разница: ${totalDiff.toFixed(2)} руб.\n`);

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
