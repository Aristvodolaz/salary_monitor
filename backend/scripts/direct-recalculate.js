// Прямой пересчет amount через SQL запрос
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

async function recalculate() {
  let pool;
  try {
    console.log('🔧 Подключение к БД...');
    console.log(`   Сервер: ${config.server}:${config.port}`);
    console.log(`   База: ${config.database}`);
    console.log(`   Пользователь: ${config.user}`);
    console.log('');
    
    pool = await sql.connect(config);
    console.log('✅ Подключено!\n');
    
    // Пересчет amount
    console.log('📝 Выполняем пересчет amount = count × rate...');
    const result = await pool.request().query(`
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
    
    console.log(`✅ Обновлено записей: ${result.rowsAffected[0]}\n`);
    
    // Проверка
    console.log('📊 Проверка результата (операции за 29.01.2026):\n');
    const check = await pool.request().query(`
      SELECT TOP 15
          CONVERT(VARCHAR, o.operation_date, 20) AS operation_date,
          o.operation_type,
          o.count AS aei_count,
          t.rate,
          o.amount AS calculated_amount
      FROM operations o
      LEFT JOIN tariffs t ON 
          (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_type = t.operation_type
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      WHERE o.operation_date >= '2026-01-29'
        AND o.operation_type LIKE '%Упаковка%'
      ORDER BY o.operation_date DESC
    `);
    
    check.recordset.forEach(row => {
      const expected = row.aei_count * row.rate;
      const isCorrect = Math.abs(row.calculated_amount - expected) < 0.01;
      const status = isCorrect ? '✅' : '❌';
      
      console.log(`${status} ${row.operation_date}`);
      console.log(`   ${row.operation_type}`);
      console.log(`   ${row.aei_count} АЕИ × ${row.rate.toFixed(2)} ₽ = ${row.calculated_amount.toFixed(2)} ₽`);
      console.log(`   Ожидалось: ${expected.toFixed(2)} ₽\n`);
    });
    
    console.log('✅ Пересчет завершен успешно!');
    
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    if (err.code === 'ELOGIN') {
      console.error('\n💡 Проблема с авторизацией!');
      console.error('   Проверьте DB_USER и DB_PASSWORD в .env файле');
    } else if (err.code === 'ESOCKET') {
      console.error('\n💡 Не удалось подключиться к серверу!');
      console.error('   Проверьте DB_HOST и DB_PORT в .env файле');
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

recalculate();
