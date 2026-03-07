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

// Тарифы из таблицы "Предлагаемая ФМС"
const tariffs = [
  { operation: 'М2 Коробочная комплектация', norm: 23, rate: 15.3 },
  { operation: 'М2 Штучн.компл.однострочн', norm: 180, rate: 2.0 },
  { operation: 'М2 Штучная комплектация', norm: 250, rate: 1.4 },
  { operation: 'М3 Коробочная комплектация', norm: 65, rate: 5.4 },
  { operation: 'М3 Штучн.компл.однострочн', norm: 34, rate: 10.4 },
  { operation: 'М3 Штучная комплектация', norm: 52, rate: 6.8 },
  { operation: 'М4 Коробочная комплектация', norm: 65, rate: 5.4 },
  { operation: 'М4 Штучн.компл.однострочн', norm: 150, rate: 2.4 },
  { operation: 'М4 Штучная комплектация', norm: 245, rate: 1.4 },
  { operation: 'М5 Коробочная комплектация', norm: 65, rate: 5.4 },
  { operation: 'М5 Штучн.компл.однострочн', norm: 260, rate: 1.4 },
  { operation: 'М5 Штучная комплектация', norm: 320, rate: 1.1 },
  { operation: 'МС Коробочная комплектация', norm: 65, rate: 5.4 },
  { operation: 'МС Штучн.компл.однострочн', norm: 110, rate: 3.2 },
  { operation: 'МС Штучная комплектация', norm: 225, rate: 1.6 },
  { operation: 'ДО Коробочная комплектация', norm: 50, rate: 7.1 },
  { operation: 'ФС Коробочная комплектация', norm: 60, rate: 5.9 },
  { operation: 'ФС Штучная комплектация', norm: 125, rate: 2.8 },
  { operation: 'М2 Упаковка', norm: 250, rate: 1.4 },
  { operation: 'М4 Упаковка', norm: 240, rate: 1.5 },
  { operation: 'МС Упаковка', norm: 210, rate: 1.7 },
  { operation: 'ПМ Упаковка', norm: 87, rate: 4.1 },
  { operation: 'М5 Упаковка', norm: 300, rate: 1.2 },
];

async function updateTariffs() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    console.log('📊 Обновление тарифов согласно таблице "Предлагаемая ФМС":\n');

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const tariff of tariffs) {
      // Проверка существования
      const checkResult = await sql.query`
        SELECT id, rate, norm_aei_per_hour 
        FROM tariffs 
        WHERE warehouse_code = 'ALL'
          AND operation_type = ${tariff.operation}
          AND is_active = 1
      `;

      if (checkResult.recordset.length === 0) {
        console.log(`❌ ${tariff.operation.padEnd(35)} - НЕ НАЙДЕН в БД`);
        notFoundCount++;
        continue;
      }

      const current = checkResult.recordset[0];
      
      // Обновление
      await sql.query`
        UPDATE tariffs
        SET rate = ${tariff.rate},
            norm_aei_per_hour = ${tariff.norm}
        WHERE id = ${current.id}
      `;
      
      const oldRate = current.rate?.toFixed(2) || '0.00';
      const newRate = tariff.rate.toFixed(2);
      const changed = oldRate !== newRate ? '🔄' : '✅';
      
      console.log(`${changed} ${tariff.operation.padEnd(35)} ${oldRate.padStart(6)} → ${newRate.padStart(6)} руб. (норм: ${tariff.norm} АЕИ/час)`);
      updatedCount++;
    }

    console.log(`\n📊 Итого:`);
    console.log(`   ✅ Обновлено: ${updatedCount}`);
    if (notFoundCount > 0) {
      console.log(`   ❌ Не найдено: ${notFoundCount}`);
    }

    // Показать все тарифы после обновления
    console.log('\n\n💰 ВСЕ ТАРИФЫ ПОСЛЕ ОБНОВЛЕНИЯ:');
    console.log('='.repeat(90));
    
    const allTariffs = await sql.query`
      SELECT 
        operation_type,
        rate,
        norm_aei_per_hour
      FROM tariffs
      WHERE is_active = 1
        AND warehouse_code = 'ALL'
      ORDER BY 
        CASE 
          WHEN operation_type LIKE 'М2%' THEN 1
          WHEN operation_type LIKE 'М3%' THEN 2
          WHEN operation_type LIKE 'М4%' THEN 3
          WHEN operation_type LIKE 'М5%' THEN 4
          WHEN operation_type LIKE 'МС%' THEN 5
          WHEN operation_type LIKE 'ДО%' THEN 6
          WHEN operation_type LIKE 'ФС%' THEN 7
          WHEN operation_type LIKE 'ПМ%' THEN 8
          ELSE 9
        END,
        operation_type
    `;

    allTariffs.recordset.forEach(t => {
      const norm = t.norm_aei_per_hour ? `${t.norm_aei_per_hour} АЕИ/час` : 'не указан';
      console.log(`${t.operation_type.padEnd(35)} ${t.rate.toFixed(2).padStart(6)} руб.  (норматив: ${norm})`);
    });

    await sql.close();
    console.log('\n\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

updateTariffs();
