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

// Все типы операций из вашей таблицы
const operationTypes = [
  // ФС
  { warehouse: 'ALL', operation: 'ФС Коробочная комплектация', rate: 5.90 },
  { warehouse: 'ALL', operation: 'ФС Штучная комплектация', rate: 2.80 },
  
  // ДО
  { warehouse: 'ALL', operation: 'ДО Коробочная комплектация', rate: 7.10 },
  { warehouse: 'ALL', operation: 'ДО Штучная комплектация', rate: 0.00 }, // Уточните ставку
  
  // МС
  { warehouse: 'ALL', operation: 'МС Коробочная комплектация', rate: 5.40 },
  { warehouse: 'ALL', operation: 'МС Штучн.компл.однострочн', rate: 3.20 },
  { warehouse: 'ALL', operation: 'МС Штучная комплектация', rate: 1.60 },
  { warehouse: 'ALL', operation: 'МС Упаковка', rate: 1.70 },
  
  // М2
  { warehouse: 'ALL', operation: 'М2 Коробочная комплектация', rate: 15.30 },
  { warehouse: 'ALL', operation: 'М2 Штучн.компл.однострочн', rate: 2.00 },
  { warehouse: 'ALL', operation: 'М2 Штучная комплектация', rate: 1.40 },
  { warehouse: 'ALL', operation: 'М2 Упаковка', rate: 1.40 },
  
  // М3
  { warehouse: 'ALL', operation: 'М3 Коробочная комплектация', rate: 5.40 },
  { warehouse: 'ALL', operation: 'М3 Штучн.компл.однострочн', rate: 10.40 },
  { warehouse: 'ALL', operation: 'М3 Штучная комплектация', rate: 6.80 },
  { warehouse: 'ALL', operation: 'М3 Упаковка', rate: 0.00 }, // Уточните ставку
  
  // М4
  { warehouse: 'ALL', operation: 'М4 Коробочная комплектация', rate: 5.40 },
  { warehouse: 'ALL', operation: 'М4 Штучн.компл.однострочн', rate: 2.40 },
  { warehouse: 'ALL', operation: 'М4 Штучная комплектация', rate: 1.40 },
  { warehouse: 'ALL', operation: 'М4 Упаковка', rate: 1.50 },
  
  // М5
  { warehouse: 'ALL', operation: 'М5 Коробочная комплектация', rate: 5.40 },
  { warehouse: 'ALL', operation: 'М5 Штучн.компл.однострочн', rate: 1.40 },
  { warehouse: 'ALL', operation: 'М5 Штучная комплектация', rate: 1.10 },
  { warehouse: 'ALL', operation: 'М5 Упаковка', rate: 1.20 },
  
  // ПМ
  { warehouse: 'ALL', operation: 'ПМ Упаковка', rate: 4.10 },
];

async function addOperationTypes() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    console.log('📊 Добавление типов операций в тарифы:\n');

    let addedCount = 0;
    let existingCount = 0;

    for (const op of operationTypes) {
      // Проверка существования
      const checkResult = await sql.query`
        SELECT id FROM tariffs 
        WHERE warehouse_code = ${op.warehouse}
          AND operation_type = ${op.operation}
          AND is_active = 1
      `;

      if (checkResult.recordset.length > 0) {
        console.log(`⏭️  ${op.operation.padEnd(35)} - уже существует`);
        existingCount++;
        continue;
      }

      // Добавление
      await sql.query`
        INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, is_active, valid_from, created_at)
        VALUES (${op.warehouse}, ${op.operation}, ${op.rate}, NULL, 1, '2024-01-01', GETDATE())
      `;
      console.log(`✅ ${op.operation.padEnd(35)} - добавлен (${op.rate.toFixed(2)} руб.)`);
      addedCount++;
    }

    console.log(`\n📊 Итого:`);
    console.log(`   ✅ Добавлено: ${addedCount}`);
    console.log(`   ⏭️  Уже существовало: ${existingCount}`);

    // Показать все тарифы
    console.log('\n\n💰 ВСЕ ТАРИФЫ В ТАБЛИЦЕ:');
    console.log('='.repeat(80));
    
    const allTariffs = await sql.query`
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
    allTariffs.recordset.forEach(t => {
      if (t.warehouse_code !== currentWh) {
        console.log(`\n📍 ${t.warehouse_code}:`);
        currentWh = t.warehouse_code;
      }
      console.log(`   ${t.operation_type.padEnd(35)} ${t.rate.toFixed(2).padStart(8)} руб.`);
    });

    await sql.close();
    console.log('\n\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

addOperationTypes();
