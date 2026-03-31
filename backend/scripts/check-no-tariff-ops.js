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

  console.log('\n=== Операции без тарифов в марте 2026 ===\n');

  // Операции, для которых нет тарифа в таблице tariffs
  const noTariff = await pool.request().query(`
    SELECT 
      o.operation_type,
      COUNT(*) as ops_count,
      SUM(o.count) as total_aei,
      SUM(o.amount) as total_amount
    FROM operations o
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <= '2026-03-31'
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t
        WHERE o.operation_type = t.operation_type
          AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      )
    GROUP BY o.operation_type
    ORDER BY total_amount DESC
  `);

  if (noTariff.recordset.length === 0) {
    console.log('✅ Все операции имеют тарифы');
  } else {
    console.log(`⚠️  Найдено ${noTariff.recordset.length} типов операций без тарифов:\n`);
    noTariff.recordset.forEach(row => {
      console.log(`${row.operation_type}:`);
      console.log(`  Операций: ${row.ops_count}`);
      console.log(`  АЕИ: ${row.total_aei}`);
      console.log(`  Сумма в БД: ${row.total_amount ? row.total_amount.toFixed(2) : '0.00'} руб.`);
      console.log('');
    });

    const totalNoTariff = noTariff.recordset.reduce((sum, row) => sum + (row.total_amount || 0), 0);
    console.log(`ИТОГО без тарифов: ${totalNoTariff.toFixed(2)} руб.\n`);
  }

  // Топ сотрудников с операциями без тарифов
  console.log('=== Топ-10 сотрудников с операциями без тарифов ===\n');
  const empNoTariff = await pool.request().query(`
    SELECT TOP 10
      u.fio,
      u.employee_id,
      COUNT(*) as ops_count,
      SUM(o.count) as total_aei,
      SUM(o.amount) as total_amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <= '2026-03-31'
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t
        WHERE o.operation_type = t.operation_type
          AND (t.warehouse_code = o.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      )
    GROUP BY u.fio, u.employee_id
    ORDER BY total_amount DESC
  `);

  empNoTariff.recordset.forEach((emp, idx) => {
    console.log(`${idx + 1}. ${emp.fio} (ШК: ${emp.employee_id})`);
    console.log(`   Операций: ${emp.ops_count}, АЕИ: ${emp.total_aei}`);
    console.log(`   Сумма: ${emp.total_amount ? emp.total_amount.toFixed(2) : '0.00'} руб.\n`);
  });

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
