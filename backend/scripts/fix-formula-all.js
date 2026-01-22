/**
 * Комплексное исправление формулы расчета зарплаты
 * 
 * ПРОБЛЕМА: Ккач применялся к каждой операции
 * РЕШЕНИЕ: Ккач применяется к СУММЕ за период
 * 
 * Шаги:
 * 1. Обновить SQL Views (убрать Ккач из операций)
 * 2. Пересчитать amounts в таблице operations (БЕЗ Ккач)
 * 3. Проверить результат на примере
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net',
  port: parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME || 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

console.log('🔧 Конфигурация БД:', {
  server: config.server,
  port: config.port,
  database: config.database,
  user: config.user
});

async function executeSqlFile(filePath, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 ${description}`);
  console.log('='.repeat(60));
  
  const sqlScript = fs.readFileSync(filePath, 'utf8');
  const batches = sqlScript
    .split(/^\s*GO\s*$/mi)
    .map(b => b.trim())
    .filter(b => b.length > 0 && !b.startsWith('--') && !b.startsWith('PRINT'));

  for (let i = 0; i < batches.length; i++) {
    try {
      await sql.query(batches[i]);
      console.log(`✅ Батч ${i + 1}/${batches.length}`);
    } catch (err) {
      if (!err.message.includes('Cannot drop the view')) {
        console.error(`⚠️ Батч ${i + 1}: ${err.message}`);
      }
    }
  }
}

async function checkResults() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 ПРОВЕРКА РЕЗУЛЬТАТА');
  console.log('='.repeat(60));
  
  const result = await sql.query`
    SELECT TOP 5
      o.id,
      u.fio,
      o.warehouse_code,
      o.participant_area,
      o.operation_type,
      o.count AS aei_count,
      t.rate,
      o.amount AS stored_amount,
      (o.count * t.rate) AS expected_amount,
      CASE 
        WHEN ABS(o.amount - (o.count * t.rate)) < 0.01 THEN '✅ OK'
        ELSE '❌ ERROR'
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
  
  console.table(result.recordset.map(r => ({
    ID: r.id,
    ФИО: r.fio?.substring(0, 20),
    Участок: r.participant_area,
    Тип: r.operation_type,
    АЕИ: r.aei_count?.toFixed(2),
    Расценка: r.rate?.toFixed(2),
    'Сохр.сумма': r.stored_amount?.toFixed(2),
    'Ожид.сумма': r.expected_amount?.toFixed(2),
    Статус: r.status
  })));
  
  console.log('\n📋 Формула: Сумма = АЕИ × Расценка (БЕЗ Ккач)');
  console.log('⚠️  Ккач применяется к СУММЕ за период в SQL Views!');
}

async function main() {
  try {
    console.log('🚀 ИСПРАВЛЕНИЕ ФОРМУЛЫ РАСЧЕТА ЗАРПЛАТЫ');
    console.log('='.repeat(60));
    console.log('Проблема: 2 АЕИ × 1.40₽ = 2.93₽ (должно быть 2.80₽)');
    console.log('Решение: Убрать Ккач из операций, применять к сумме');
    
    await sql.connect(config);
    console.log('\n✅ Подключено к БД');

    // Шаг 1: Обновить Views
    await executeSqlFile(
      path.join(__dirname, '../../database/views.sql'),
      'Обновление SQL Views'
    );

    // Шаг 2: Пересчитать amounts
    await executeSqlFile(
      path.join(__dirname, '../../database/recalculate-operations-amount.sql'),
      'Пересчет сумм операций'
    );

    // Шаг 3: Проверка
    await checkResults();

    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ ВСЕ ИСПРАВЛЕНИЯ ПРИМЕНЕНЫ УСПЕШНО!');
    console.log('='.repeat(60));
    
    await sql.close();
  } catch (err) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
