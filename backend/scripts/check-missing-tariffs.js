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

async function checkMissingTariffs() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Получить все уникальные комбинации склад+операция из таблицы operations
    console.log('📊 Уникальные комбинации склад+операция в таблице operations:');
    console.log('='.repeat(80));
    
    const operationsResult = await sql.query`
      SELECT DISTINCT
        o.warehouse_code,
        o.operation_type,
        COUNT(*) as operations_count,
        SUM(o.amount) as total_amount
      FROM operations o
      GROUP BY o.warehouse_code, o.operation_type
      ORDER BY o.warehouse_code, o.operation_type
    `;

    console.log(`Найдено ${operationsResult.recordset.length} уникальных комбинаций\n`);

    // Получить все тарифы
    const tariffsResult = await sql.query`
      SELECT DISTINCT
        warehouse_code,
        operation_type
      FROM tariffs
      WHERE is_active = 1
    `;

    // Проверить, для каких комбинаций нет тарифов
    console.log('🔍 ПРОВЕРКА: Операции БЕЗ тарифов:');
    console.log('='.repeat(80));
    
    let missingCount = 0;
    let currentWarehouse = '';
    
    for (const op of operationsResult.recordset) {
      // Проверяем, есть ли тариф для этой комбинации
      const hasTariff = tariffsResult.recordset.some(t => 
        (t.warehouse_code === op.warehouse_code || t.warehouse_code === 'ALL') &&
        t.operation_type === op.operation_type
      );

      if (!hasTariff) {
        if (op.warehouse_code !== currentWarehouse) {
          console.log(`\n📍 ${op.warehouse_code}:`);
          currentWarehouse = op.warehouse_code;
        }
        console.log(`   ❌ ${op.operation_type.padEnd(35)} (${op.operations_count} операций, ${op.total_amount.toFixed(2)} руб.)`);
        missingCount++;
      }
    }

    if (missingCount === 0) {
      console.log('\n✅ Все операции имеют тарифы!');
    } else {
      console.log(`\n⚠️  Найдено ${missingCount} комбинаций без тарифов`);
    }

    // Показать все существующие тарифы
    console.log('\n\n💰 СУЩЕСТВУЮЩИЕ ТАРИФЫ:');
    console.log('='.repeat(80));
    
    const allTariffsResult = await sql.query`
      SELECT 
        warehouse_code,
        operation_type,
        rate
      FROM tariffs
      WHERE is_active = 1
      ORDER BY 
        CASE warehouse_code WHEN 'ALL' THEN 1 ELSE 2 END,
        warehouse_code,
        operation_type
    `;

    let currentWh = '';
    allTariffsResult.recordset.forEach(t => {
      if (t.warehouse_code !== currentWh) {
        console.log(`\n📍 ${t.warehouse_code}:`);
        currentWh = t.warehouse_code;
      }
      console.log(`   ${t.operation_type.padEnd(35)} ${t.rate.toFixed(2).padStart(8)} руб.`);
    });

    // Предложить SQL для добавления недостающих тарифов
    console.log('\n\n📝 SQL для добавления недостающих тарифов:');
    console.log('='.repeat(80));
    
    const missingTariffs = [];
    for (const op of operationsResult.recordset) {
      const hasTariff = tariffsResult.recordset.some(t => 
        (t.warehouse_code === op.warehouse_code || t.warehouse_code === 'ALL') &&
        t.operation_type === op.operation_type
      );

      if (!hasTariff) {
        missingTariffs.push({
          warehouse: op.warehouse_code,
          operation: op.operation_type
        });
      }
    }

    if (missingTariffs.length > 0) {
      console.log('\n-- Добавьте эти тарифы в таблицу tariffs:');
      missingTariffs.forEach(t => {
        console.log(`INSERT INTO tariffs (warehouse_code, operation_type, rate, is_active, valid_from) VALUES ('ALL', '${t.operation}', 0.00, 1, '2024-01-01');`);
      });
      console.log('\n-- После добавления установите правильные ставки (rate)');
    }

    await sql.close();
    console.log('\n\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

checkMissingTariffs();
