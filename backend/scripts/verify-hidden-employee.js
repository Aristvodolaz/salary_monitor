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

  console.log('\n=== Проверка: сотрудник 00000000 скрыт ===\n');

  // 1. Проверяем, есть ли он в БД
  const check = await pool.request().query(`
    SELECT id, fio, employee_id
    FROM users
    WHERE employee_id = '00000000'
  `);

  if (check.recordset.length === 0) {
    console.log('✅ Сотрудник 00000000 не найден в БД\n');
  } else {
    const emp = check.recordset[0];
    console.log(`Сотрудник найден в БД:`);
    console.log(`  ID: ${emp.id}`);
    console.log(`  ФИО: ${emp.fio}`);
    console.log(`  ШК: ${emp.employee_id}\n`);

    // 2. Проверяем, сколько у него операций
    const ops = await pool.request()
      .input('empId', sql.NVarChar, '00000000')
      .query(`
        SELECT 
          COUNT(*) as total_ops,
          SUM(count) as total_aei,
          SUM(amount) as total_amount
        FROM operations o
        INNER JOIN users u ON o.user_id = u.id
        WHERE u.employee_id = @empId
          AND o.operation_date >= '2026-02-01'
          AND o.operation_date <= '2026-02-28'
      `);

    const data = ops.recordset[0];
    console.log('Операции за февраль 2026:');
    console.log(`  Операций: ${data.total_ops}`);
    console.log(`  АЕИ: ${data.total_aei}`);
    console.log(`  Сумма: ${data.total_amount ? data.total_amount.toFixed(2) : '0.00'} руб.\n`);
  }

  // 3. Проверяем запрос с фильтром (как в admin.service.ts)
  console.log('=== Проверка запроса с фильтром (февраль 2026) ===\n');
  const filtered = await pool.request()
    .input('warehouseId', sql.Int, 1)
    .input('startDate', sql.Date, '2026-02-01')
    .input('endDate', sql.Date, '2026-02-28')
    .query(`
      SELECT 
        sd.user_id,
        u.employee_id,
        u.fio,
        COUNT(DISTINCT CAST(sd.operation_date AS DATE)) as work_days,
        COUNT(DISTINCT sd.operation_id) as total_operations,
        SUM(sd.aei_count) as total_aei,
        SUM(sd.base_amount) as total_amount
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
        AND u.employee_id != '00000000'
      GROUP BY sd.user_id, u.employee_id, u.fio
      ORDER BY total_amount DESC
    `);

  console.log(`Найдено сотрудников: ${filtered.recordset.length}`);
  
  const hasZero = filtered.recordset.find(emp => emp.employee_id === '00000000');
  if (hasZero) {
    console.log('❌ Сотрудник 00000000 ВСЁ ЕЩЁ в списке!');
  } else {
    console.log('✅ Сотрудник 00000000 НЕ в списке (скрыт)\n');
  }

  // 4. Топ-5 сотрудников
  console.log('Топ-5 сотрудников за февраль:');
  filtered.recordset.slice(0, 5).forEach((emp, idx) => {
    console.log(`  ${idx + 1}. ${emp.fio} (ШК: ${emp.employee_id}) - ${emp.total_amount.toFixed(2)} руб.`);
  });

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
