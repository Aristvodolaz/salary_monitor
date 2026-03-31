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

  console.log('\n=== Исправление: обнуление amount для операций без тарифов ===\n');

  // 1. Проверяем, сколько операций нужно исправить
  const check = await pool.request().query(`
    SELECT 
      COUNT(*) as ops_count,
      SUM(amount) as total_amount_before
    FROM operations o
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <= '2026-03-31'
      AND amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t
        WHERE o.operation_type = t.operation_type
          AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      )
  `);

  const { ops_count, total_amount_before } = check.recordset[0];

  if (ops_count === 0) {
    console.log('✅ Нет операций для исправления');
    await pool.close();
    process.exit(0);
  }

  console.log(`⚠️  Найдено ${ops_count} операций без тарифов с amount > 0`);
  console.log(`   Сумма до исправления: ${total_amount_before ? total_amount_before.toFixed(2) : '0.00'} руб.\n`);

  // 2. Обнуляем amount
  console.log('Обнуляем amount для этих операций...\n');

  const result = await pool.request().query(`
    UPDATE operations
    SET amount = 0
    WHERE operation_date >= '2026-03-01'
      AND operation_date <= '2026-03-31'
      AND amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t
        WHERE operations.operation_type = t.operation_type
          AND (t.warehouse_code = operations.warehouse_code OR t.warehouse_code = 'ALL')
          AND operations.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR operations.operation_date <= t.valid_to)
          AND t.is_active = 1
      )
  `);

  console.log(`✅ Обновлено ${result.rowsAffected[0]} записей\n`);

  // 3. Проверяем результат
  const verify = await pool.request().query(`
    SELECT 
      COUNT(*) as ops_count,
      SUM(amount) as total_amount_after
    FROM operations o
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <= '2026-03-31'
      AND amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t
        WHERE o.operation_type = t.operation_type
          AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      )
  `);

  const { ops_count: after_count, total_amount_after } = verify.recordset[0];

  if (after_count === 0) {
    console.log('✅ Все операции без тарифов теперь имеют amount = 0');
  } else {
    console.log(`⚠️  Осталось ${after_count} операций с amount > 0`);
  }

  console.log(`\n=== Итого ===`);
  console.log(`Было: ${total_amount_before ? total_amount_before.toFixed(2) : '0.00'} руб.`);
  console.log(`Стало: ${total_amount_after ? total_amount_after.toFixed(2) : '0.00'} руб.`);
  console.log(`Разница: ${(total_amount_before - (total_amount_after || 0)).toFixed(2)} руб.\n`);

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
