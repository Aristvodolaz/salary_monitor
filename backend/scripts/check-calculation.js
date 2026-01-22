const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

(async () => {
  try {
    await sql.connect(config);
    
    console.log('🔍 Проверка расчета для М4 Упаковка:\n');
    
    const result = await sql.query`
      SELECT TOP 10
        o.id,
        o.operation_type,
        o.count AS aei_count,
        o.amount AS stored_amount,
        o.actdura,
        t.rate,
        t.norm_aei_per_hour,
        (o.count * t.rate) AS expected_simple,
        (o.actdura / 60.0 * t.norm_aei_per_hour * t.rate) AS expected_from_actdura
      FROM operations o
      LEFT JOIN tariffs t ON 
        (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_type = t.operation_type
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
      WHERE o.operation_type LIKE '%Упаковка%'
        AND o.warehouse_code = '02DQ'
      ORDER BY o.operation_date DESC, o.id DESC
    `;
    
    console.table(result.recordset.map(r => ({
      id: r.id,
      type: r.operation_type,
      АЕИ: r.aei_count?.toFixed(2),
      'Сохр.сумма': r.stored_amount?.toFixed(2),
      'Actdura(мин)': r.actdura?.toFixed(2),
      'Расценка': r.rate?.toFixed(2),
      'Норматив/ч': r.norm_aei_per_hour,
      'АЕИ*Расценка': r.expected_simple?.toFixed(2),
      'Через Actdura': r.expected_from_actdura?.toFixed(2)
    })));
    
    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
})();
