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

async function fixDuplicates() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Найти дубликаты
    console.log('🔍 Поиск дубликатов в salary_summary...');
    const duplicatesResult = await sql.query`
      SELECT 
        user_id,
        period_start,
        period_end,
        quality_coefficient,
        COUNT(*) as cnt,
        MIN(id) as keep_id
      FROM salary_summary
      GROUP BY user_id, period_start, period_end, quality_coefficient
      HAVING COUNT(*) > 1
    `;

    if (duplicatesResult.recordset.length === 0) {
      console.log('✅ Дубликатов не найдено!');
      await sql.close();
      return;
    }

    console.log(`⚠️ Найдено ${duplicatesResult.recordset.length} групп дубликатов:\n`);
    duplicatesResult.recordset.forEach(row => {
      console.log(`  user_id=${row.user_id}, период: ${row.period_start.toISOString().split('T')[0]} - ${row.period_end?.toISOString().split('T')[0] || 'NULL'}, коэф=${row.quality_coefficient}, дублей=${row.cnt}, оставить id=${row.keep_id}`);
    });

    // Удалить дубликаты, оставив только одну запись с MIN(id)
    console.log('\n🗑️  Удаление дубликатов...');
    
    for (const dup of duplicatesResult.recordset) {
      const result = await sql.query`
        DELETE FROM salary_summary
        WHERE user_id = ${dup.user_id}
          AND period_start = ${dup.period_start}
          AND (
            (period_end IS NULL AND ${dup.period_end} IS NULL)
            OR
            (period_end = ${dup.period_end})
          )
          AND quality_coefficient = ${dup.quality_coefficient}
          AND id != ${dup.keep_id}
      `;
      console.log(`  ✅ Удалено ${result.rowsAffected[0]} дубликатов для user_id=${dup.user_id}`);
    }

    console.log('\n✅ Дубликаты удалены!');
    console.log('\n📊 Проверяем результат...');
    
    const checkResult = await sql.query`
      SELECT 
        user_id,
        period_start,
        period_end,
        quality_coefficient,
        COUNT(*) as cnt
      FROM salary_summary
      GROUP BY user_id, period_start, period_end, quality_coefficient
      HAVING COUNT(*) > 1
    `;

    if (checkResult.recordset.length === 0) {
      console.log('✅ Все дубликаты успешно удалены!');
    } else {
      console.log('⚠️  Остались дубликаты:', checkResult.recordset);
    }

    await sql.close();
    console.log('\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

fixDuplicates();
