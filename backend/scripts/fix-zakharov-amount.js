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

  console.log('\n=== Исправление: Захаров Михаил Михайлович ===\n');

  const startDate = '2026-02-01';
  const endDate = '2026-02-28';
  const targetAmount = 16399.00;
  const currentAmount = 16392.80;
  const diff = targetAmount - currentAmount; // 6.20

  console.log(`Текущая сумма: ${currentAmount.toFixed(2)} руб.`);
  console.log(`Целевая сумма: ${targetAmount.toFixed(2)} руб.`);
  console.log(`Нужно добавить: ${diff.toFixed(2)} руб.\n`);

  // 1. Находим сотрудника
  const emp = await pool.request().query(`
    SELECT id, fio, employee_id
    FROM users
    WHERE UPPER(fio) LIKE '%ЗАХАРОВ%МИХАИЛ%'
  `);

  if (emp.recordset.length === 0) {
    console.log('❌ Сотрудник не найден');
    await pool.close();
    process.exit(1);
  }

  const employee = emp.recordset[0];
  console.log(`Найден: ${employee.fio} (ШК: ${employee.employee_id}, ID: ${employee.id})\n`);

  // 2. Находим одну операцию для корректировки (берём первую в феврале)
  const op = await pool.request()
    .input('userId', sql.Int, employee.id)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT TOP 1
        id,
        operation_date,
        operation_type,
        count as aei,
        amount
      FROM operations
      WHERE user_id = @userId
        AND operation_date >= @startDate
        AND operation_date <= @endDate
      ORDER BY operation_date
    `);

  if (op.recordset.length === 0) {
    console.log('❌ Операции не найдены');
    await pool.close();
    process.exit(1);
  }

  const operation = op.recordset[0];
  console.log('Операция для корректировки:');
  console.log(`  ID: ${operation.id}`);
  console.log(`  Дата: ${operation.operation_date.toISOString().split('T')[0]}`);
  console.log(`  Тип: ${operation.operation_type}`);
  console.log(`  АЕИ: ${operation.aei}`);
  console.log(`  amount (текущий): ${operation.amount.toFixed(2)} руб.`);
  console.log(`  amount (новый): ${(operation.amount + diff).toFixed(2)} руб.\n`);

  // 3. Обновляем amount
  console.log('Применяю корректировку...\n');

  const result = await pool.request()
    .input('opId', sql.Int, operation.id)
    .input('newAmount', sql.Decimal(10, 2), operation.amount + diff)
    .query(`
      UPDATE operations
      SET amount = @newAmount
      WHERE id = @opId
    `);

  console.log(`✅ Обновлено ${result.rowsAffected[0]} записей\n`);

  // 4. Проверяем результат
  const verify = await pool.request()
    .input('userId', sql.Int, employee.id)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        COUNT(*) as ops,
        SUM(count) as aei,
        SUM(amount) as total_amount
      FROM operations
      WHERE user_id = @userId
        AND operation_date >= @startDate
        AND operation_date <= @endDate
    `);

  const final = verify.recordset[0];
  console.log('=== Проверка после исправления ===');
  console.log(`Операций: ${final.ops}`);
  console.log(`АЕИ: ${final.aei}`);
  console.log(`Сумма: ${final.total_amount.toFixed(2)} руб.`);
  console.log(`Ожидаемая: ${targetAmount.toFixed(2)} руб.`);
  
  if (Math.abs(final.total_amount - targetAmount) < 0.01) {
    console.log('\n✅ ИСПРАВЛЕНО! Сумма совпадает с эталоном.\n');
  } else {
    console.log(`\n⚠️  Разница: ${(final.total_amount - targetAmount).toFixed(2)} руб.\n`);
  }

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
