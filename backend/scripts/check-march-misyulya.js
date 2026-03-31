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

  console.log('\n=== Детальная проверка: Мисюля Елена Ивановна (март 2026) ===\n');

  const targetFio = 'МИСЮЛЯ ЕЛЕНА ИВАНОВНА .';
  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  // 1. Общая сумма
  const summary = await pool.request()
    .input('fio', sql.NVarChar, targetFio)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        COUNT(*) as total_operations,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE u.fio = @fio
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
    `);

  const { total_operations, total_aei, total_amount } = summary.recordset[0];

  console.log(`Операций: ${total_operations}`);
  console.log(`АЕИ: ${total_aei}`);
  console.log(`Сумма (БД): ${total_amount.toFixed(2)} руб.`);
  console.log(`Ожидаемая (Excel): 59315.20 руб.`);
  console.log(`Разница: ${(total_amount - 59315.20).toFixed(2)} руб.\n`);

  // 2. Проверка на дубли по sap_order_id
  console.log('=== Проверка на дубли (одинаковые sap_order_id + operation_date) ===\n');
  const duplicates = await pool.request()
    .input('fio', sql.NVarChar, targetFio)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        o.sap_order_id,
        o.operation_date,
        o.operation_type,
        COUNT(*) as dup_count,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE u.fio = @fio
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
        AND o.sap_order_id IS NOT NULL
      GROUP BY o.sap_order_id, o.operation_date, o.operation_type
      HAVING COUNT(*) > 1
      ORDER BY total_amount DESC
    `);

  if (duplicates.recordset.length > 0) {
    console.log(`⚠️  Найдено ${duplicates.recordset.length} групп дублей:\n`);
    let dupSum = 0;
    duplicates.recordset.forEach(row => {
      console.log(`${row.sap_order_id} | ${row.operation_date.toISOString().split('T')[0]} | ${row.operation_type}`);
      console.log(`  Дублей: ${row.dup_count}, Сумма: ${row.total_amount.toFixed(2)} руб.`);
      // Считаем лишнюю сумму (дубли - 1 оригинал)
      dupSum += row.total_amount * (row.dup_count - 1) / row.dup_count;
    });
    console.log(`\nСумма дублей: ${dupSum.toFixed(2)} руб.\n`);
  } else {
    console.log('✅ Дублей не найдено\n');
  }

  // 3. Операции без тарифов
  console.log('=== Операции без тарифов ===\n');
  const noTariff = await pool.request()
    .input('fio', sql.NVarChar, targetFio)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        o.operation_type,
        COUNT(*) as ops_count,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE u.fio = @fio
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
        AND NOT EXISTS (
          SELECT 1 FROM tariffs t
          WHERE o.operation_type = t.operation_type
            AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
            AND o.operation_date >= t.valid_from
            AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
            AND t.is_active = 1
        )
      GROUP BY o.operation_type
    `);

  if (noTariff.recordset.length > 0) {
    console.log(`⚠️  Найдено ${noTariff.recordset.length} типов операций без тарифов:\n`);
    let noTariffSum = 0;
    noTariff.recordset.forEach(row => {
      console.log(`${row.operation_type}: ${row.ops_count} оп., ${row.total_aei} АЕИ, ${row.total_amount.toFixed(2)} руб.`);
      noTariffSum += row.total_amount;
    });
    console.log(`\nСумма без тарифов: ${noTariffSum.toFixed(2)} руб.\n`);
  } else {
    console.log('✅ Все операции имеют тарифы\n');
  }

  // 4. Детализация по типам с тарифами
  console.log('=== Операции С тарифами ===\n');
  const withTariff = await pool.request()
    .input('fio', sql.NVarChar, targetFio)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        o.operation_type,
        COUNT(*) as ops_count,
        SUM(o.count) as total_aei,
        AVG(t.rate) as avg_rate,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      LEFT JOIN tariffs t ON 
        o.operation_type = t.operation_type
        AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE u.fio = @fio
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
        AND EXISTS (
          SELECT 1 FROM tariffs t2
          WHERE o.operation_type = t2.operation_type
            AND (t2.warehouse_code = o.warehouse_code OR t2.warehouse_code = 'ALL')
            AND o.operation_date >= t2.valid_from
            AND (t2.valid_to IS NULL OR o.operation_date <= t2.valid_to)
            AND t2.is_active = 1
        )
      GROUP BY o.operation_type
      ORDER BY total_amount DESC
    `);

  let withTariffSum = 0;
  withTariff.recordset.forEach(row => {
    console.log(`${row.operation_type}:`);
    console.log(`  ${row.ops_count} оп., ${row.total_aei} АЕИ × ${row.avg_rate.toFixed(2)} = ${row.total_amount.toFixed(2)} руб.`);
    withTariffSum += row.total_amount;
  });
  console.log(`\nСумма с тарифами: ${withTariffSum.toFixed(2)} руб.\n`);

  console.log('=== Итого ===');
  console.log(`Сумма в БД: ${total_amount.toFixed(2)} руб.`);
  console.log(`Ожидаемая: 59315.20 руб.`);
  console.log(`Разница: ${(total_amount - 59315.20).toFixed(2)} руб.`);

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
