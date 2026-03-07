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

async function deleteOperations() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    const startDate = '2026-01-10 00:00:00';
    const endDate = '2026-01-15 23:59:59';

    console.log(`📅 Период для удаления: ${startDate} - ${endDate}\n`);

    // Сначала посмотрим, что будет удалено
    console.log('🔍 Проверка данных для удаления...');
    const checkResult = await sql.query`
      SELECT 
        COUNT(*) as total_operations,
        COUNT(DISTINCT user_id) as users_count,
        SUM(amount) as total_amount,
        MIN(operation_date) as min_date,
        MAX(operation_date) as max_date
      FROM operations
      WHERE operation_date >= ${startDate}
        AND operation_date <= ${endDate}
    `;

    const stats = checkResult.recordset[0];
    console.log(`Найдено операций: ${stats.total_operations}`);
    console.log(`Пользователей: ${stats.users_count}`);
    console.log(`Общая сумма: ${stats.total_amount?.toFixed(2) || 0}`);
    console.log(`Диапазон дат: ${stats.min_date?.toISOString() || 'N/A'} - ${stats.max_date?.toISOString() || 'N/A'}\n`);

    if (stats.total_operations === 0) {
      console.log('✅ Нет данных для удаления');
      await sql.close();
      return;
    }

    // Подробная информация по пользователям
    console.log('📊 Операции по пользователям:');
    const usersResult = await sql.query`
      SELECT 
        u.employee_id,
        u.fio,
        COUNT(*) as operations_count,
        SUM(o.amount) as total_amount
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      WHERE o.operation_date >= ${startDate}
        AND o.operation_date <= ${endDate}
      GROUP BY u.employee_id, u.fio
      ORDER BY total_amount DESC
    `;

    usersResult.recordset.forEach(row => {
      console.log(`  ${row.employee_id} (${row.fio}): ${row.operations_count} операций, ${row.total_amount.toFixed(2)} руб.`);
    });

    console.log('\n⚠️  ВНИМАНИЕ! Данные будут удалены безвозвратно!');
    console.log('Для продолжения раскомментируйте строку с DELETE в скрипте.\n');

    // УДАЛЕНИЕ
    console.log('🗑️  Удаление операций...');
    const deleteResult = await sql.query`
      DELETE FROM operations
      WHERE operation_date >= ${startDate}
        AND operation_date <= ${endDate}
    `;
    console.log(`✅ Удалено операций: ${deleteResult.rowsAffected[0]}`);
    
    // Также удалим связанные записи из salary_summary, если они есть
    console.log('\n🗑️  Проверка salary_summary...');
    const deleteSummaryResult = await sql.query`
      DELETE FROM salary_summary
      WHERE period_start >= ${startDate}
        AND period_end <= ${endDate}
    `;
    if (deleteSummaryResult.rowsAffected[0] > 0) {
      console.log(`✅ Удалено записей из salary_summary: ${deleteSummaryResult.rowsAffected[0]}`);
    } else {
      console.log('ℹ️  Нет записей в salary_summary для удаления');
    }

    await sql.close();
    console.log('\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

deleteOperations();
