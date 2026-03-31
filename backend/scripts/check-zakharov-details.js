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

  console.log('\n=== Детальная проверка: Захаров Михаил Михайлович (февраль 2026) ===\n');

  const startDate = '2026-02-01';
  const endDate = '2026-02-28';

  // Ищем сотрудника
  const emp = await pool.request()
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        u.fio,
        u.employee_id,
        COUNT(*) as total_operations,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE UPPER(u.fio) LIKE '%ЗАХАРОВ%МИХАИЛ%'
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
      GROUP BY u.fio, u.employee_id
    `);

  if (emp.recordset.length === 0) {
    console.log('❌ Сотрудник не найден');
    await pool.close();
    process.exit(1);
  }

  const employee = emp.recordset[0];
  console.log(`ФИО: ${employee.fio}`);
  console.log(`ШК: ${employee.employee_id}`);
  console.log(`Операций: ${employee.total_operations}`);
  console.log(`АЕИ: ${employee.total_aei}`);
  console.log(`Сумма (БД): ${employee.total_amount.toFixed(2)} руб.`);
  console.log(`Ожидаемая: 16399.00 руб.`);
  console.log(`Разница: ${(employee.total_amount - 16399).toFixed(2)} руб.\n`);

  // Детализация по типам операций
  console.log('=== Детализация по типам операций ===\n');
  const details = await pool.request()
    .input('employeeId', sql.Int, employee.employee_id)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        o.operation_type,
        COUNT(*) as ops_count,
        SUM(o.count) as total_aei,
        AVG(t.rate) as avg_rate,
        SUM(o.amount) as total_amount,
        SUM(o.count * t.rate) as expected_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      LEFT JOIN tariffs t ON 
        o.operation_type = t.operation_type
        AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE u.employee_id = @employeeId
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
      GROUP BY o.operation_type
      ORDER BY total_amount DESC
    `);

  let totalExpected = 0;
  details.recordset.forEach(row => {
    const diff = row.total_amount - row.expected_amount;
    console.log(`${row.operation_type}:`);
    console.log(`  Операций: ${row.ops_count}`);
    console.log(`  АЕИ: ${row.total_aei}`);
    console.log(`  Ставка: ${row.avg_rate ? row.avg_rate.toFixed(2) : 'НЕТ'}`);
    console.log(`  Сумма (БД): ${row.total_amount.toFixed(2)} руб.`);
    console.log(`  Ожидаемая: ${row.expected_amount.toFixed(2)} руб.`);
    if (Math.abs(diff) > 0.01) {
      console.log(`  ⚠️  Разница: ${diff.toFixed(2)} руб.`);
    }
    console.log('');
    totalExpected += row.expected_amount;
  });

  console.log(`ИТОГО ожидаемая: ${totalExpected.toFixed(2)} руб.\n`);

  // Проверка на операции с amount != count * rate
  console.log('=== Операции с неправильным amount ===\n');
  const wrongAmount = await pool.request()
    .input('employeeId', sql.Int, employee.employee_id)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT TOP 20
        o.id,
        o.operation_date,
        o.operation_type,
        o.count as aei,
        t.rate,
        o.amount as stored_amount,
        (o.count * t.rate) as expected_amount,
        (o.amount - o.count * t.rate) as diff
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      LEFT JOIN tariffs t ON 
        o.operation_type = t.operation_type
        AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE u.employee_id = @employeeId
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
        AND ABS(o.amount - o.count * ISNULL(t.rate, 0)) > 0.01
      ORDER BY ABS(o.amount - o.count * ISNULL(t.rate, 0)) DESC
    `);

  if (wrongAmount.recordset.length > 0) {
    console.log(`⚠️  Найдено ${wrongAmount.recordset.length} операций с неправильным amount:\n`);
    wrongAmount.recordset.forEach(row => {
      console.log(`ID: ${row.id} | ${row.operation_date.toISOString().split('T')[0]} | ${row.operation_type}`);
      console.log(`  АЕИ: ${row.aei}, Ставка: ${row.rate ? row.rate.toFixed(2) : 'НЕТ'}`);
      console.log(`  amount (БД): ${row.stored_amount.toFixed(2)}, Ожидаемая: ${row.expected_amount.toFixed(2)}`);
      console.log(`  Разница: ${row.diff.toFixed(2)} руб.\n`);
    });
  } else {
    console.log('✅ Все операции имеют правильный amount\n');
  }

  // Проверка на дубли
  console.log('=== Проверка на дубли ===\n');
  const duplicates = await pool.request()
    .input('employeeId', sql.Int, employee.employee_id)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        o.sap_order_id,
        o.operation_date,
        o.operation_type,
        COUNT(*) as dup_count,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE u.employee_id = @employeeId
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
        AND o.sap_order_id IS NOT NULL
      GROUP BY o.sap_order_id, o.operation_date, o.operation_type
      HAVING COUNT(*) > 1
    `);

  if (duplicates.recordset.length > 0) {
    console.log(`⚠️  Найдено ${duplicates.recordset.length} групп дублей`);
  } else {
    console.log('✅ Дублей не найдено');
  }

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
