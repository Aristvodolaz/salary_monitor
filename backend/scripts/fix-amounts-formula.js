// Скрипт для исправления формулы расчета amount
// Теперь: amount = count * rate (используя округленные АЕИ)
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'SalaryMonitor',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

async function fixAmountsFormula() {
  try {
    console.log('🔧 Исправление формулы расчета amount...\n');
    
    await sql.connect(config);
    
    // Читаем SQL скрипт
    const sqlScript = fs.readFileSync(
      path.join(__dirname, '../../database/fix-amounts-formula.sql'),
      'utf8'
    );
    
    // Выполняем обновление
    console.log('📝 Выполняем пересчет...');
    const result = await sql.query`
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
    `;
    
    console.log(`✅ Обновлено записей: ${result.rowsAffected[0]}\n`);
    
    // Проверка
    console.log('📊 Примеры пересчитанных сумм:\n');
    const check = await sql.query`
      SELECT TOP 10
          operation_date,
          operation_type,
          count AS aei_count,
          t.rate,
          amount AS calculated_amount,
          count * t.rate AS verification
      FROM operations o
      LEFT JOIN tariffs t ON 
          (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
          AND o.operation_type = t.operation_type
          AND o.operation_date >= t.valid_from
          AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
          AND t.is_active = 1
      WHERE operation_date >= '2026-01-29'
      ORDER BY operation_date DESC
    `;
    
    check.recordset.forEach(row => {
      console.log(`${new Date(row.operation_date).toLocaleString('ru-RU')}`);
      console.log(`  ${row.operation_type}`);
      console.log(`  ${row.aei_count} АЕИ × ${row.rate} ₽ = ${row.calculated_amount.toFixed(2)} ₽`);
      
      const isCorrect = Math.abs(row.calculated_amount - row.verification) < 0.01;
      console.log(`  ${isCorrect ? '✅' : '❌'} Проверка: ${row.verification.toFixed(2)} ₽\n`);
    });
    
    await sql.close();
    console.log('✅ Формула исправлена! Теперь amount = count × rate');
    
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

fixAmountsFormula();
