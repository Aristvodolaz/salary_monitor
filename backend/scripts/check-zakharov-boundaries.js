const sql = require('mssql');
const cfg = { 
  server: 'PRM-SRV-MSSQL-01.komus.net', 
  port: 59587, 
  user: 'sa', 
  password: 'icY2eGuyfU', 
  database: 'SalaryMonitor', 
  options: { trustServerCertificate: true, encrypt: false } 
};

async function main() {
  const pool = await sql.connect(cfg);

  console.log('\n=== Проверка границ периода: Захаров Михаил Михайлович ===\n');

  // Все операции в феврале и начале марта
  const ops = await pool.request().query(`
    SELECT 
      o.operation_date,
      o.operation_type,
      o.count as aei,
      o.amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE UPPER(u.fio) LIKE '%ЗАХАРОВ%МИХАИЛ%'
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date < '2026-03-05'
    ORDER BY o.operation_date
  `);

  console.log(`Всего операций: ${ops.recordset.length}\n`);

  // Группируем по дням
  const byDay = {};
  ops.recordset.forEach(row => {
    const day = row.operation_date.toISOString().split('T')[0];
    if (!byDay[day]) {
      byDay[day] = { count: 0, aei: 0, amount: 0 };
    }
    byDay[day].count++;
    byDay[day].aei += row.aei;
    byDay[day].amount += row.amount;
  });

  console.log('=== По дням ===\n');
  Object.keys(byDay).sort().forEach(day => {
    const data = byDay[day];
    console.log(`${day}: ${data.count} оп., ${data.aei} АЕИ, ${data.amount.toFixed(2)} руб.`);
  });

  // Проверяем разные варианты периода
  console.log('\n=== Варианты периода ===\n');

  const variants = [
    { name: 'Февраль (01-28)', start: '2026-02-01', end: '2026-02-28 23:59:59.999' },
    { name: 'Февраль + 1 марта', start: '2026-02-01', end: '2026-03-01 23:59:59.999' },
    { name: 'Февраль + 2 марта', start: '2026-02-01', end: '2026-03-02 23:59:59.999' },
  ];

  for (const variant of variants) {
    const result = await pool.request()
      .input('start', sql.DateTime, variant.start)
      .input('end', sql.DateTime, variant.end)
      .query(`
        SELECT 
          COUNT(*) as ops,
          SUM(o.count) as aei,
          SUM(o.amount) as amount
        FROM operations o
        INNER JOIN users u ON o.user_id = u.id
        WHERE UPPER(u.fio) LIKE '%ЗАХАРОВ%МИХАИЛ%'
          AND o.operation_date >= @start
          AND o.operation_date <= @end
      `);

    const data = result.recordset[0];
    const match = Math.abs(data.amount - 16399) < 0.1 ? '✅ СОВПАДАЕТ!' : '';
    console.log(`${variant.name}: ${data.ops} оп., ${data.aei} АЕИ, ${data.amount.toFixed(2)} руб. ${match}`);
  }

  // Проверяем, есть ли операции ровно на 6.20 руб.
  console.log('\n=== Операции на 6.20 руб. ===\n');
  const exact = await pool.request().query(`
    SELECT 
      o.operation_date,
      o.operation_type,
      o.count as aei,
      o.amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE UPPER(u.fio) LIKE '%ЗАХАРОВ%МИХАИЛ%'
      AND o.operation_date >= '2026-02-01'
      AND o.operation_date < '2026-03-05'
      AND o.amount = 6.20
  `);

  if (exact.recordset.length > 0) {
    console.log(`Найдено ${exact.recordset.length} операций на 6.20 руб.:`);
    exact.recordset.forEach(row => {
      console.log(`  ${row.operation_date.toISOString()} | ${row.operation_type} | ${row.aei} АЕИ`);
    });
  } else {
    console.log('Операций на 6.20 руб. не найдено');
  }

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
