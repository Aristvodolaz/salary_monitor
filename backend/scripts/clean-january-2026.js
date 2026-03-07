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

async function cleanJanuary() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    const startDate = '2026-01-01 00:00:00';
    const endDate = '2026-01-31 23:59:59';

    console.log(`📅 Период для удаления: январь 2026 (${startDate} - ${endDate})\n`);

    // Проверка данных
    console.log('🔍 Проверка данных для удаления...');
    
    const checkOps = await sql.query`
      SELECT 
        COUNT(*) as total_operations,
        COUNT(DISTINCT user_id) as users_count,
        COUNT(DISTINCT warehouse_code) as warehouses_count,
        SUM(amount) as total_amount,
        MIN(operation_date) as min_date,
        MAX(operation_date) as max_date
      FROM operations
      WHERE operation_date >= ${startDate}
        AND operation_date <= ${endDate}
    `;

    const opsStats = checkOps.recordset[0];
    console.log('\n📊 ОПЕРАЦИИ (operations):');
    console.log(`   Операций: ${opsStats.total_operations}`);
    console.log(`   Пользователей: ${opsStats.users_count}`);
    console.log(`   Складов: ${opsStats.warehouses_count}`);
    console.log(`   Общая сумма: ${opsStats.total_amount?.toFixed(2) || 0} руб.`);
    console.log(`   Даты: ${opsStats.min_date?.toISOString().split('T')[0]} - ${opsStats.max_date?.toISOString().split('T')[0]}`);

    const checkSummary = await sql.query`
      SELECT COUNT(*) as total_records
      FROM salary_summary
      WHERE period_start >= '2026-01-01'
        AND period_end <= '2026-01-31'
    `;

    console.log(`\n📊 SALARY_SUMMARY:`);
    console.log(`   Записей: ${checkSummary.recordset[0].total_records}`);

    if (opsStats.total_operations === 0) {
      console.log('\n✅ Нет данных для удаления');
      await sql.close();
      return;
    }

    // УДАЛЕНИЕ
    console.log('\n\n🗑️  НАЧИНАЕМ УДАЛЕНИЕ...\n');

    // 1. Удаление операций
    console.log('1️⃣ Удаление операций...');
    const deleteOps = await sql.query`
      DELETE FROM operations
      WHERE operation_date >= ${startDate}
        AND operation_date <= ${endDate}
    `;
    console.log(`   ✅ Удалено операций: ${deleteOps.rowsAffected[0]}`);

    // 2. Удаление salary_summary
    console.log('\n2️⃣ Удаление записей из salary_summary...');
    const deleteSummary = await sql.query`
      DELETE FROM salary_summary
      WHERE period_start >= '2026-01-01'
        AND period_end <= '2026-01-31'
    `;
    console.log(`   ✅ Удалено записей: ${deleteSummary.rowsAffected[0]}`);

    // Проверка результата
    console.log('\n\n✅ УДАЛЕНИЕ ЗАВЕРШЕНО!\n');
    
    const verifyOps = await sql.query`
      SELECT COUNT(*) as remaining
      FROM operations
      WHERE operation_date >= ${startDate}
        AND operation_date <= ${endDate}
    `;

    const verifySummary = await sql.query`
      SELECT COUNT(*) as remaining
      FROM salary_summary
      WHERE period_start >= '2026-01-01'
        AND period_end <= '2026-01-31'
    `;

    console.log('📊 Проверка:');
    console.log(`   Операций осталось: ${verifyOps.recordset[0].remaining}`);
    console.log(`   Salary_summary осталось: ${verifySummary.recordset[0].remaining}`);

    if (verifyOps.recordset[0].remaining === 0 && verifySummary.recordset[0].remaining === 0) {
      console.log('\n✅ Все данные за январь 2026 успешно удалены!');
    } else {
      console.log('\n⚠️  Остались данные, проверьте!');
    }

    await sql.close();
    console.log('\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

cleanJanuary();
