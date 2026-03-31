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

  // Параметры для проверки (укажите ФИО из Excel)
  const targetFio = 'МИСЮЛЯ ЕЛЕНА ИВАНОВНА .';
  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  console.log(`\n=== Проверка расчёта для: ${targetFio} ===`);
  console.log(`Период: ${startDate} — ${endDate}\n`);

  // 1. Итоговая сумма из БД
  const summary = await pool.request()
    .input('fio', sql.NVarChar, targetFio)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        u.fio,
        u.employee_id,
        COUNT(*) as total_operations,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount_db
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE u.fio = @fio
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
      GROUP BY u.fio, u.employee_id
    `);

  if (summary.recordset.length === 0) {
    console.log('❌ Сотрудник не найден в БД');
    process.exit(1);
  }

  const emp = summary.recordset[0];
  console.log(`ФИО: ${emp.fio}`);
  console.log(`ШК: ${emp.employee_id}`);
  console.log(`Операций: ${emp.total_operations}`);
  console.log(`АЕИ: ${emp.total_aei}`);
  console.log(`Сумма (БД): ${emp.total_amount_db.toFixed(2)} руб.\n`);

  // 2. Детализация по типам операций
  console.log('=== Детализация по типам операций ===\n');
  const details = await pool.request()
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
      GROUP BY o.operation_type
      ORDER BY total_amount DESC
    `);

  details.recordset.forEach(row => {
    console.log(`${row.operation_type}:`);
    console.log(`  Операций: ${row.ops_count}`);
    console.log(`  АЕИ: ${row.total_aei}`);
    console.log(`  Ставка (ср.): ${row.avg_rate ? row.avg_rate.toFixed(2) : 'НЕТ'}`);
    console.log(`  Сумма: ${row.total_amount.toFixed(2)} руб.`);
    console.log(`  Проверка: ${row.total_aei} × ${row.avg_rate ? row.avg_rate.toFixed(2) : 0} = ${(row.total_aei * (row.avg_rate || 0)).toFixed(2)}`);
    console.log('');
  });

  // 3. Проверка на дубли
  console.log('=== Проверка на дубли (одинаковые operation_date + sap_order_id) ===\n');
  const duplicates = await pool.request()
    .input('fio', sql.NVarChar, targetFio)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT 
        o.operation_date,
        o.sap_order_id,
        o.operation_type,
        COUNT(*) as dup_count,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE u.fio = @fio
        AND o.operation_date >= @startDate
        AND o.operation_date <= @endDate
      GROUP BY o.operation_date, o.sap_order_id, o.operation_type
      HAVING COUNT(*) > 1
      ORDER BY dup_count DESC
    `);

  if (duplicates.recordset.length > 0) {
    console.log(`⚠️  Найдено ${duplicates.recordset.length} групп дублей:\n`);
    duplicates.recordset.slice(0, 10).forEach(row => {
      console.log(`  ${row.operation_date.toISOString().split('T')[0]} | ${row.sap_order_id} | ${row.operation_type}`);
      console.log(`    Дублей: ${row.dup_count}, АЕИ: ${row.total_aei}, Сумма: ${row.total_amount.toFixed(2)}`);
    });
  } else {
    console.log('✅ Дублей не найдено');
  }

  console.log('\n=== Итого ===');
  console.log(`Сумма в БД: ${emp.total_amount_db.toFixed(2)} руб.`);
  console.log(`Ожидаемая сумма (из Excel): укажите вручную для сравнения`);

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
