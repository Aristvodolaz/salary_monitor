// Проверка расчета сумм для операций
const sql = require('mssql');
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

async function checkCalculations() {
  try {
    await sql.connect(config);
    
    const result = await sql.query`
      SELECT TOP 10
        o.id,
        o.operation_date,
        o.operation_type,
        o.count AS aei_count,
        o.actdura,
        o.amount AS stored_amount,
        t.rate,
        t.norm_aei_per_hour,
        (o.actdura / 60.0) * t.norm_aei_per_hour AS calculated_aei,
        ((o.actdura / 60.0) * t.norm_aei_per_hour) * t.rate AS calculated_amount
      FROM operations o
      LEFT JOIN tariffs t ON 
        (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_type = t.operation_type
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE o.operation_type LIKE '%Упаковка%'
        AND o.operation_date >= '2026-01-29'
      ORDER BY o.operation_date DESC
    `;
    
    console.log('\n📊 Проверка расчетов для операций Упаковка:\n');
    console.log('='.repeat(80));
    
    result.recordset.forEach(row => {
      console.log(`\nID: ${row.id}`);
      console.log(`  Дата: ${new Date(row.operation_date).toLocaleString('ru-RU')}`);
      console.log(`  Тип: ${row.operation_type}`);
      console.log(`  Actdura: ${row.actdura} мин`);
      console.log(`  Норматив: ${row.norm_aei_per_hour} АЕИ/час`);
      console.log(`  Расценка: ${row.rate} ₽/АЕИ`);
      console.log(`  ─────────────────────────────────────────`);
      console.log(`  АЕИ (вычисленный): ${row.calculated_aei?.toFixed(2)}`);
      console.log(`  АЕИ (в БД):        ${row.aei_count}`);
      console.log(`  ─────────────────────────────────────────`);
      console.log(`  Сумма (должна быть): ${row.calculated_amount?.toFixed(2)} ₽`);
      console.log(`  Сумма (в БД):        ${row.stored_amount?.toFixed(2)} ₽`);
      
      const diff = row.stored_amount - row.calculated_amount;
      if (Math.abs(diff) > 0.01) {
        console.log(`  ⚠️  ОШИБКА! Разница: ${diff.toFixed(2)} ₽`);
      } else {
        console.log(`  ✅ Расчет верный`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    
    // Проверим также простой расчет
    console.log('\n\n🧮 Простая проверка:\n');
    const simpleCalc = [
      { aei: 8, rate: 1.40 },
      { aei: 6, rate: 1.40 },
      { aei: 10, rate: 1.40 }
    ];
    
    simpleCalc.forEach(item => {
      const expected = item.aei * item.rate;
      console.log(`${item.aei} АЕИ × ${item.rate} ₽ = ${expected.toFixed(2)} ₽`);
    });
    
    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

checkCalculations();
