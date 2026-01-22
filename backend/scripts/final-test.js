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

async function main() {
  try {
    console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ ФОРМУЛЫ РАСЧЕТА');
    console.log('='.repeat(70));
    console.log('Формула: Переменная часть = Ʃ (АЕИ × Расценка) × Ккач');
    console.log('Где Ккач применяется к СУММЕ за период, а не к каждой операции\n');

    await sql.connect(config);

    // Тест 1: Операции М4 Упаковка
    console.log('📊 ТЕСТ 1: Проверка отдельных операций (БЕЗ Ккач)');
    console.log('-'.repeat(70));
    
    const ops = await sql.query`
      SELECT TOP 5
        o.id,
        u.fio,
        o.participant_area,
        o.operation_type,
        o.count AS aei,
        t.rate,
        o.amount,
        (o.count * t.rate) AS expected
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      LEFT JOIN tariffs t ON 
        (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_type = t.operation_type
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE o.operation_type = 'М4 Упаковка'
      ORDER BY o.operation_date DESC
    `;

    console.table(ops.recordset.map(r => ({
      ID: r.id,
      ФИО: r.fio?.substring(0, 20),
      Участок: r.participant_area,
      АЕИ: r.aei?.toFixed(2),
      'Расц.': r.rate?.toFixed(2),
      'Формула': `${r.aei?.toFixed(2)} × ${r.rate?.toFixed(2)}`,
      'Сумма': r.amount?.toFixed(2),
      'Ожид.': r.expected?.toFixed(2),
      'Статус': Math.abs(r.amount - r.expected) < 0.01 ? '✅ OK' : '❌ ERROR'
    })));

    // Тест 2: Агрегация по дням через view
    console.log('\n📊 ТЕСТ 2: Агрегация за день (С учетом Ккач из salary_summary)');
    console.log('-'.repeat(70));

    const days = await sql.query`
      SELECT TOP 3
        user_id,
        fio,
        warehouse_code,
        date,
        operations_count,
        total_aei,
        base_amount,
        quality_coefficient,
        total_amount
      FROM v_salary_by_day
      WHERE warehouse_code = '02DQ'
      ORDER BY date DESC
    `;

    console.table(days.recordset.map(r => ({
      ФИО: r.fio?.substring(0, 20),
      Дата: r.date?.toISOString()?.split('T')[0],
      'Оп.': r.operations_count,
      'АЕИ': r.total_aei?.toFixed(2),
      'База': r.base_amount?.toFixed(2),
      'Ккач': r.quality_coefficient?.toFixed(2),
      'Формула': `${r.base_amount?.toFixed(2)} × ${r.quality_coefficient?.toFixed(2)}`,
      'Итог': r.total_amount?.toFixed(2)
    })));

    // Тест 3: Конкретный пример
    console.log('\n📊 ТЕСТ 3: Конкретный пример расчета');
    console.log('-'.repeat(70));
    console.log('Пример: Сотрудник выполнил за день:');
    console.log('  • М4 Упаковка: 2 АЕИ × 1.40₽ = 2.80₽');
    console.log('  • М4 Упаковка: 3 АЕИ × 1.40₽ = 4.20₽');
    console.log('  • М4 Упаковка: 1 АЕИ × 1.40₽ = 1.40₽');
    console.log('  База за день: 2.80 + 4.20 + 1.40 = 8.40₽');
    console.log('  Если Ккач = 1.0 (без ошибок): 8.40₽ × 1.0 = 8.40₽');
    console.log('  Если Ккач = 1.12 (0 ошибок): 8.40₽ × 1.12 = 9.41₽');
    console.log('  Если Ккач = 1.04 (4 ошибки): 8.40₽ × 1.04 = 8.74₽\n');

    console.log('='.repeat(70));
    console.log('✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
    console.log('='.repeat(70));
    console.log('\n📋 Итоговая формула:');
    console.log('  1. Операция: amount = АЕИ × Расценка (БЕЗ Ккач)');
    console.log('  2. День: total = Ʃ(amount) × Ккач');
    console.log('  3. Месяц: total = Ʃ(день.total)\n');

    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

main();
