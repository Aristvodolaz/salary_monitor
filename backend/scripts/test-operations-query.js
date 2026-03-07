const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'icY2eGuyfU',
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function testQuery() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Сначала найдем user_id по employee_id
    const employeeId = '00079442';
    console.log(`🔍 Ищем пользователя с employee_id: ${employeeId}`);
    
    const userResult = await sql.query`
      SELECT id, employee_id, fio FROM users WHERE employee_id = ${employeeId}
    `;
    
    if (userResult.recordset.length === 0) {
      console.log('❌ Пользователь не найден!');
      return;
    }
    
    const userId = userResult.recordset[0].id;
    console.log(`✅ Найден: ${userResult.recordset[0].fio} (id: ${userId})\n`);
    
    const startDate = '2026-02-01';
    const endDate = '2026-02-10';
    console.log(`📅 Период: ${startDate} - ${endDate}\n`);

    // Старый запрос (без коэффициента)
    console.log('=== СТАРЫЙ ЗАПРОС (без коэффициента качества) ===');
    const oldResult = await sql.query`
      SELECT 
        operation_type,
        COUNT(*) as operations_count,
        SUM(aei_count) as total_aei,
        SUM(base_amount) as total_amount
      FROM v_salary_details
      WHERE user_id = ${userId}
        AND operation_date >= ${startDate}
        AND operation_date <= ${endDate}
      GROUP BY operation_type
      ORDER BY total_amount DESC
    `;
    console.log('Результат:', oldResult.recordset);
    const oldTotal = oldResult.recordset.reduce((sum, row) => sum + (row.total_amount || 0), 0);
    console.log(`Итого: ${oldTotal.toFixed(2)}\n`);

    // Новый запрос (с коэффициентом)
    console.log('=== НОВЫЙ ЗАПРОС (с коэффициентом качества) ===');
    const newResult = await sql.query`
      WITH daily_ops AS (
        SELECT 
          sd.operation_type,
          CAST(sd.operation_date AS DATE) as op_date,
          COUNT(DISTINCT sd.operation_id) as operations_count,
          SUM(sd.aei_count) as total_aei,
          SUM(sd.base_amount) as base_amount
        FROM v_salary_details sd
        WHERE sd.user_id = ${userId}
          AND sd.operation_date >= ${startDate}
          AND sd.operation_date <= ${endDate}
        GROUP BY sd.operation_type, CAST(sd.operation_date AS DATE)
      )
      SELECT 
        do.operation_type,
        SUM(do.operations_count) as operations_count,
        SUM(do.total_aei) as total_aei,
        SUM(do.base_amount) as base_amount,
        SUM(do.base_amount * COALESCE(sbd.quality_coefficient, 1.0)) as total_amount
      FROM daily_ops do
      LEFT JOIN v_salary_by_day sbd ON 
        sbd.user_id = ${userId}
        AND sbd.date = do.op_date
      GROUP BY do.operation_type
      ORDER BY total_amount DESC
    `;
    console.log('Результат:', newResult.recordset);
    const newTotal = newResult.recordset.reduce((sum, row) => sum + (row.total_amount || 0), 0);
    console.log(`Итого: ${newTotal.toFixed(2)}\n`);

    // Проверка данных из v_salary_by_month
    console.log('=== ПРОВЕРКА: Текущий месяц из v_salary_by_month ===');
    const monthResult = await sql.query`
      SELECT total_amount, operations_count, total_aei
      FROM v_salary_by_month
      WHERE user_id = ${userId}
        AND year = 2026
        AND month = 2
    `;
    console.log('Результат:', monthResult.recordset);
    
    // Проверка: все операции напрямую из таблицы operations
    console.log('\n=== ПРОВЕРКА: Все операции напрямую из таблицы operations ===');
    const directOpsResult = await sql.query`
      SELECT 
        operation_type,
        COUNT(*) as operations_count,
        SUM(count) as total_aei,
        SUM(amount) as total_amount
      FROM operations
      WHERE user_id = ${userId}
        AND operation_date >= ${startDate}
        AND operation_date <= ${endDate}
      GROUP BY operation_type
      ORDER BY total_amount DESC
    `;
    console.log('Результат:', directOpsResult.recordset);
    const directTotal = directOpsResult.recordset.reduce((sum, row) => sum + (row.total_amount || 0), 0);
    console.log(`Итого: ${directTotal.toFixed(2)}`);
    
    // Проверка коэффициента качества
    console.log('\n=== ПРОВЕРКА: Коэффициент качества по дням ===');
    const qualityResult = await sql.query`
      SELECT 
        date,
        quality_coefficient,
        base_amount,
        total_amount,
        operations_count,
        total_aei
      FROM v_salary_by_day
      WHERE user_id = ${userId}
        AND date >= ${startDate}
        AND date <= ${endDate}
      ORDER BY date
    `;
    console.log('Результат:');
    qualityResult.recordset.forEach(row => {
      console.log(`  ${row.date.toISOString().split('T')[0]}: коэф=${row.quality_coefficient}, база=${row.base_amount.toFixed(2)}, итого=${row.total_amount.toFixed(2)}, АЕИ=${row.total_aei}`);
    });
    
    const totalFromDays = qualityResult.recordset.reduce((sum, row) => sum + row.total_amount, 0);
    console.log(`\nИтого по дням: ${totalFromDays.toFixed(2)}`);
    
    // Проверка: может быть дубликаты в v_salary_details?
    console.log('\n=== ПРОВЕРКА: Дубликаты в v_salary_details ===');
    const duplicatesResult = await sql.query`
      SELECT 
        operation_id,
        operation_type,
        COUNT(*) as cnt
      FROM v_salary_details
      WHERE user_id = ${userId}
        AND operation_date >= ${startDate}
        AND operation_date <= ${endDate}
      GROUP BY operation_id, operation_type
      HAVING COUNT(*) > 1
    `;
    if (duplicatesResult.recordset.length > 0) {
      console.log('⚠️ НАЙДЕНЫ ДУБЛИКАТЫ:');
      console.log(duplicatesResult.recordset);
    } else {
      console.log('✅ Дубликатов нет');
    }
    
    // Подсчет количества строк в v_salary_details
    console.log('\n=== ПРОВЕРКА: Количество строк в v_salary_details ===');
    const countResult = await sql.query`
      SELECT COUNT(*) as total_rows
      FROM v_salary_details
      WHERE user_id = ${userId}
        AND operation_date >= ${startDate}
        AND operation_date <= ${endDate}
    `;
    console.log(`Всего строк: ${countResult.recordset[0].total_rows}`);
    
    // Проверка salary_summary - может там дубли?
    console.log('\n=== ПРОВЕРКА: salary_summary для этого пользователя ===');
    const summaryResult = await sql.query`
      SELECT *
      FROM salary_summary
      WHERE user_id = ${userId}
        AND (
          (period_start <= ${endDate} AND period_end >= ${startDate})
          OR
          (period_start <= ${startDate} AND (period_end IS NULL OR period_end >= ${startDate}))
        )
      ORDER BY period_start
    `;
    console.log('Результат:');
    summaryResult.recordset.forEach(row => {
      console.log(`  ${row.period_start.toISOString().split('T')[0]} - ${row.period_end ? row.period_end.toISOString().split('T')[0] : 'NULL'}: коэф=${row.quality_coefficient}`);
    });

    await sql.close();
    console.log('\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

testQuery();
