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

async function updateSalarySummary() {
  try {
    console.log('📊 ОБНОВЛЕНИЕ ТАБЛИЦЫ salary_summary\n');
    console.log('='.repeat(70));

    await sql.connect(config);
    console.log('✅ Подключено к БД\n');

    // 1. Показать текущее состояние
    const currentCount = await sql.query`SELECT COUNT(*) as total FROM salary_summary`;
    console.log(`📋 Текущее количество записей: ${currentCount.recordset[0].total}`);

    // 2. Очистить таблицу
    console.log('\n🗑️  Очистка таблицы...');
    await sql.query`TRUNCATE TABLE salary_summary`;
    console.log('✅ Таблица очищена');

    // 3. Заполнить из v_salary_by_month
    console.log('\n📥 Заполнение из v_salary_by_month...');
    
    const insertQuery = `
      INSERT INTO salary_summary (
        user_id,
        period_start,
        period_end,
        total_amount,
        quality_coefficient,
        errors_count
      )
      SELECT 
        user_id,
        period_start,
        EOMONTH(period_start) as period_end,
        total_amount,
        avg_quality_coefficient,
        0 as errors_count
      FROM v_salary_by_month
    `;
    
    await sql.query(insertQuery);

    // 4. Показать результат
    const newCount = await sql.query`SELECT COUNT(*) as total FROM salary_summary`;
    console.log(`✅ Добавлено записей: ${newCount.recordset[0].total}`);

    // 5. Показать примеры
    console.log('\n📊 Примеры записей:');
    console.log('-'.repeat(70));
    
    const examples = await sql.query`
      SELECT TOP 10
        ss.user_id,
        u.fio,
        ss.period_start,
        ss.period_end,
        ss.total_amount,
        ss.quality_coefficient,
        ss.errors_count
      FROM salary_summary ss
      INNER JOIN users u ON ss.user_id = u.id
      ORDER BY ss.period_start DESC, ss.total_amount DESC
    `;

    console.table(examples.recordset.map(r => ({
      UID: r.user_id,
      ФИО: r.fio?.substring(0, 20),
      'С': r.period_start?.toISOString()?.split('T')[0],
      'По': r.period_end?.toISOString()?.split('T')[0],
      'Сумма': r.total_amount?.toFixed(2) + '₽',
      'Ккач': r.quality_coefficient?.toFixed(2),
      'Ошибок': r.errors_count
    })));

    // 6. Статистика по месяцам
    console.log('\n📈 Статистика по месяцам:');
    console.log('-'.repeat(70));
    
    const monthlyStats = await sql.query`
      SELECT 
        period_start,
        COUNT(*) as users,
        SUM(total_amount) as total_salary,
        AVG(total_amount) as avg_salary,
        AVG(quality_coefficient) as avg_quality
      FROM salary_summary
      GROUP BY period_start
      ORDER BY period_start DESC
    `;

    console.table(monthlyStats.recordset.map(r => ({
      Месяц: r.period_start?.toISOString()?.split('T')[0],
      'Сотрудников': r.users,
      'Всего ЗП': r.total_salary?.toFixed(2) + '₽',
      'Средняя': r.avg_salary?.toFixed(2) + '₽',
      'Средний Ккач': r.avg_quality?.toFixed(2)
    })));

    console.log('\n' + '='.repeat(70));
    console.log('✅ ОБНОВЛЕНИЕ ЗАВЕРШЕНО УСПЕШНО!');
    console.log('='.repeat(70));
    console.log('\n💡 Теперь salary_summary будет обновляться автоматически');
    console.log('   после каждой синхронизации с SAP (каждый день в 02:00)\n');

    await sql.close();
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

updateSalarySummary();
