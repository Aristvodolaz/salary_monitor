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

async function testTariffs() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Тестовые данные: склады и типы операций
    const testCases = [
      { warehouse: 'ФС', operation: 'Штучная комплектация' },
      { warehouse: 'ДО', operation: 'Коробочная комплектация' },
      { warehouse: 'МС', operation: 'Упаковка' },
      { warehouse: 'М2', operation: 'Штучная комплектация' },
      { warehouse: 'М3', operation: 'Коробочная комплектация' },
      { warehouse: 'М4', operation: 'Упаковка' },
      { warehouse: 'М5', operation: 'Штучная комплектация' },
      { warehouse: 'ПМ', operation: 'Упаковка' },
    ];

    console.log('🧪 ТЕСТ: Применение тарифов к складам-участкам');
    console.log('='.repeat(80));
    console.log('Проверяем, что тарифы с warehouse_code="ALL" применяются ко всем складам\n');

    for (const test of testCases) {
      const result = await sql.query`
        SELECT 
          t.warehouse_code,
          t.operation_type,
          t.rate
        FROM tariffs t
        WHERE (${test.warehouse} = t.warehouse_code OR t.warehouse_code = 'ALL')
          AND t.operation_type = ${test.operation}
          AND t.is_active = 1
          AND GETDATE() >= t.valid_from
          AND (t.valid_to IS NULL OR GETDATE() <= t.valid_to)
      `;

      if (result.recordset.length > 0) {
        const tariff = result.recordset[0];
        console.log(`✅ ${test.warehouse.padEnd(4)} + ${test.operation.padEnd(30)} = ${tariff.rate.toFixed(2)} руб. (из ${tariff.warehouse_code})`);
      } else {
        console.log(`❌ ${test.warehouse.padEnd(4)} + ${test.operation.padEnd(30)} = НЕТ ТАРИФА`);
      }
    }

    console.log('\n📊 Все тарифы из таблицы tariffs:');
    console.log('='.repeat(80));
    
    const allTariffs = await sql.query`
      SELECT 
        warehouse_code,
        operation_type,
        rate,
        valid_from,
        valid_to
      FROM tariffs
      WHERE is_active = 1
      ORDER BY warehouse_code, operation_type
    `;

    let currentWarehouse = '';
    allTariffs.recordset.forEach(t => {
      if (t.warehouse_code !== currentWarehouse) {
        console.log(`\n📍 ${t.warehouse_code}:`);
        currentWarehouse = t.warehouse_code;
      }
      const validTo = t.valid_to ? t.valid_to.toISOString().split('T')[0] : 'бессрочно';
      console.log(`   ${t.operation_type.padEnd(30)} ${t.rate.toFixed(2).padStart(8)} руб.`);
    });

    await sql.close();
    console.log('\n\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

testTariffs();
