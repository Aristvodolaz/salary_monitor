// Скрипт обновления тарифов на 2026 год (предлагаемая ФМС)
const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectionTimeout: 30000,
    requestTimeout: 30000
  }
};

// Новые тарифы (предлагаемая ФМС)
// В БД все тарифы хранятся с warehouse_code = 'ALL'
const newTariffs = [
  // М2
  { type: 'М2 Коробочная комплектация', norm: 23, rate: 15.3 },
  { type: 'М2 Штучн.компл.однострочн', norm: 180, rate: 2.0 },
  { type: 'М2 Штучная комплектация', norm: 250, rate: 1.4 },
  { type: 'М2 Упаковка', norm: 250, rate: 1.4 },
  
  // М3
  { type: 'М3 Коробочная комплектация', norm: 65, rate: 5.4 },
  { type: 'М3 Штучн.компл.однострочн', norm: 34, rate: 10.4 },
  { type: 'М3 Штучная комплектация', norm: 52, rate: 6.8 },
  
  // М4
  { type: 'М4 Коробочная комплектация', norm: 65, rate: 5.4 },
  { type: 'М4 Штучн.компл.однострочн', norm: 150, rate: 2.4 },
  { type: 'М4 Штучная комплектация', norm: 245, rate: 1.4 },
  { type: 'М4 Упаковка', norm: 240, rate: 1.5 },
  
  // М5
  { type: 'М5 Коробочная комплектация', norm: 65, rate: 5.4 },
  { type: 'М5 Штучн.компл.однострочн', norm: 260, rate: 1.4 },
  { type: 'М5 Штучная комплектация', norm: 320, rate: 1.1 },
  { type: 'М5 Упаковка', norm: 300, rate: 1.2 },
  
  // МС
  { type: 'МС Коробочная комплектация', norm: 65, rate: 5.4 },
  { type: 'МС Штучн.компл.однострочн', norm: 110, rate: 3.2 },
  { type: 'МС Штучная комплектация', norm: 225, rate: 1.6 },
  { type: 'МС Упаковка', norm: 210, rate: 1.7 },
  
  // ДО
  { type: 'ДО Коробочная комплектация', norm: 50, rate: 7.1 },
  
  // ФС
  { type: 'ФС Коробочная комплектация', norm: 60, rate: 5.9 },
  { type: 'ФС Штучная комплектация', norm: 125, rate: 2.8 },
  
  // ПМ
  { type: 'ПМ Упаковка', norm: 87, rate: 4.1 }
];

async function updateTariffs() {
  let pool;
  try {
    console.log('🔧 Обновление тарифов на 2026 год...\n');
    console.log(`   Сервер: ${config.server}:${config.port}`);
    console.log(`   База: ${config.database}\n`);
    
    pool = await sql.connect(config);
    console.log('✅ Подключено!\n');
    
    // 1. Показываем текущие тарифы
    console.log('📊 ТЕКУЩИЕ ТАРИФЫ:\n');
    const current = await pool.request().query(`
      SELECT warehouse_code, operation_type, rate, norm_aei_per_hour
      FROM tariffs
      WHERE is_active = 1
      ORDER BY warehouse_code, operation_type
    `);
    
    current.recordset.forEach(row => {
      console.log(`   ${row.warehouse_code} - ${row.operation_type}: ${row.rate} ₽ (норматив: ${row.norm_aei_per_hour})`);
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📝 ОБНОВЛЯЕМ НА НОВЫЕ ТАРИФЫ:\n');
    
    let updated = 0;
    let notFound = 0;
    
    for (const tariff of newTariffs) {
      const result = await pool.request()
        .input('type', sql.VarChar(255), tariff.type)
        .input('rate', sql.Decimal(10, 2), tariff.rate)
        .input('norm', sql.Int, tariff.norm)
        .query(`
          UPDATE tariffs
          SET rate = @rate,
              norm_aei_per_hour = @norm
          WHERE warehouse_code = 'ALL'
            AND operation_type = @type
            AND is_active = 1
        `);
      
      if (result.rowsAffected[0] > 0) {
        console.log(`   ✅ ${tariff.type}: ${tariff.rate} ₽ (норматив: ${tariff.norm})`);
        updated++;
      } else {
        console.log(`   ⚠️  ${tariff.type}: НЕ НАЙДЕН в БД!`);
        notFound++;
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 ОБНОВЛЕННЫЕ ТАРИФЫ:\n');
    
    const updated_tariffs = await pool.request().query(`
      SELECT warehouse_code, operation_type, rate, norm_aei_per_hour
      FROM tariffs
      WHERE is_active = 1
      ORDER BY warehouse_code, operation_type
    `);
    
    updated_tariffs.recordset.forEach(row => {
      console.log(`   ${row.warehouse_code} - ${row.operation_type}: ${row.rate} ₽ (норматив: ${row.norm_aei_per_hour})`);
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`✅ Обновлено: ${updated} тарифов`);
    if (notFound > 0) {
      console.log(`⚠️  Не найдено в БД: ${notFound} тарифов`);
    }
    
    // 2. Пересчитываем все суммы с новыми тарифами
    console.log('\n📝 Пересчитываем суммы операций с новыми тарифами...');
    
    const recalc = await pool.request().query(`
      UPDATE o
      SET o.amount = o.count * t.rate
      FROM operations o
      LEFT JOIN tariffs t ON 
          (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_type = t.operation_type
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      WHERE t.rate IS NOT NULL;
    `);
    
    console.log(`✅ Пересчитано: ${recalc.rowsAffected[0]} операций\n`);
    
    // 3. Проверяем примеры
    console.log('📊 Примеры расчета с новыми тарифами:\n');
    
    const check = await pool.request().query(`
      SELECT TOP 10
          CONVERT(VARCHAR, o.operation_date, 20) AS operation_date,
          o.warehouse_code,
          o.operation_type,
          o.count AS aei_count,
          t.rate,
          o.amount
      FROM operations o
      LEFT JOIN tariffs t ON 
          (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_type = t.operation_type
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      WHERE o.operation_date >= '2026-01-29'
      ORDER BY o.operation_date DESC
    `);
    
    check.recordset.forEach(row => {
      console.log(`   ${row.operation_date}`);
      console.log(`   ${row.warehouse_code} - ${row.operation_type}`);
      console.log(`   ${row.aei_count} АЕИ × ${row.rate.toFixed(2)} ₽ = ${row.amount.toFixed(2)} ₽\n`);
    });
    
    console.log('✅ Тарифы обновлены успешно!');
    
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

updateTariffs();
