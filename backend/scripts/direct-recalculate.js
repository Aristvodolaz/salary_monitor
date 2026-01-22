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
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    console.log('🔄 Пересчет сумм operations...\n');

    const updateQuery = `
      UPDATE o
      SET o.amount = o.count * t.rate,
          o.updated_at = GETDATE()
      FROM operations o
      INNER JOIN tariffs t ON 
          (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_type = t.operation_type
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
    `;

    const result = await sql.query(updateQuery);
    console.log(`✅ Обновлено строк: ${result.rowsAffected[0]}\n`);

    // Проверка
    console.log('📊 Проверка результата:\n');
    const check = await sql.query`
      SELECT TOP 5
        o.id,
        u.fio,
        o.warehouse_code,
        o.participant_area,
        o.operation_type,
        o.count AS aei_count,
        t.rate,
        o.amount,
        (o.count * t.rate) AS expected,
        CASE 
          WHEN ABS(o.amount - (o.count * t.rate)) < 0.01 THEN 'OK ✅'
          ELSE 'ERROR ❌'
        END AS status
      FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      LEFT JOIN tariffs t ON 
        (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_type = t.operation_type
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE o.operation_type LIKE '%Упаковка%'
      ORDER BY o.operation_date DESC
    `;

    console.table(check.recordset.map(r => ({
      ID: r.id,
      ФИО: r.fio?.substring(0, 15),
      Участок: r.participant_area,
      Тип: r.operation_type?.substring(0, 15),
      АЕИ: r.aei_count?.toFixed(2),
      'Расц.': r.rate?.toFixed(2),
      'Сумма': r.amount?.toFixed(2),
      'Ожид.': r.expected?.toFixed(2),
      'OK?': r.status
    })));

    console.log('\n✅ Пересчет завершен!');
    console.log('📋 Формула: amount = count × rate (БЕЗ Ккач)\n');
    
    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

main();
