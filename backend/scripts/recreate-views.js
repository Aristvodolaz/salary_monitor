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

const views = [
  {
    name: 'v_salary_details',
    sql: `
CREATE VIEW v_salary_details AS
SELECT 
    o.id AS operation_id,
    u.id AS user_id,
    u.employee_id,
    u.fio,
    u.warehouse_id,
    w.code AS warehouse_code,
    w.name AS warehouse_name,
    o.operation_type,
    o.participant_area,
    o.count AS aei_count,
    o.operation_date,
    t.rate,
    t.norm_aei_per_hour,
    o.amount AS base_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN warehouses w ON o.warehouse_code = w.code
LEFT JOIN tariffs t ON 
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE u.is_active = 1
    `
  },
  {
    name: 'v_salary_by_day',
    sql: `
CREATE VIEW v_salary_by_day AS
SELECT 
    sd.user_id,
    sd.employee_id,
    sd.fio,
    sd.warehouse_code,
    sd.warehouse_name,
    CAST(sd.operation_date AS DATE) AS date,
    COUNT(DISTINCT sd.operation_id) AS operations_count,
    SUM(sd.aei_count) AS total_aei,
    SUM(sd.base_amount) AS base_amount,
    COALESCE(ss.quality_coefficient, 1.0) AS quality_coefficient,
    SUM(sd.base_amount) * COALESCE(ss.quality_coefficient, 1.0) AS total_amount
FROM v_salary_details sd
LEFT JOIN salary_summary ss ON 
    sd.user_id = ss.user_id 
    AND CAST(sd.operation_date AS DATE) BETWEEN ss.period_start AND ss.period_end
GROUP BY 
    sd.user_id,
    sd.employee_id,
    sd.fio,
    sd.warehouse_code,
    sd.warehouse_name,
    CAST(sd.operation_date AS DATE),
    COALESCE(ss.quality_coefficient, 1.0)
    `
  },
  {
    name: 'v_salary_by_month',
    sql: `
CREATE VIEW v_salary_by_month AS
SELECT 
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    YEAR(date) AS year,
    MONTH(date) AS month,
    DATEFROMPARTS(YEAR(date), MONTH(date), 1) AS period_start,
    SUM(operations_count) AS operations_count,
    SUM(total_aei) AS total_aei,
    SUM(base_amount) AS base_amount,
    AVG(quality_coefficient) AS avg_quality_coefficient,
    SUM(total_amount) AS total_amount
FROM v_salary_by_day
GROUP BY 
    user_id,
    employee_id,
    fio,
    warehouse_code,
    warehouse_name,
    YEAR(date),
    MONTH(date)
    `
  }
];

async function main() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    for (const view of views) {
      console.log(`🔄 Пересоздание view: ${view.name}`);
      
      // Drop
      try {
        await sql.query(`DROP VIEW ${view.name}`);
        console.log(`  ✅ Удален старый view`);
      } catch (err) {
        console.log(`  ⚠️ View не существует, создаем новый`);
      }
      
      // Create
      try {
        await sql.query(view.sql);
        console.log(`  ✅ Создан новый view\n`);
      } catch (err) {
        console.error(`  ❌ Ошибка создания: ${err.message}\n`);
      }
    }

    // Проверка
    console.log('📊 Проверка данных через v_salary_details:\n');
    const result = await sql.query`
      SELECT TOP 5
        operation_id,
        fio,
        warehouse_code,
        participant_area,
        operation_type,
        aei_count,
        rate,
        base_amount,
        (aei_count * rate) AS expected
      FROM v_salary_details
      WHERE operation_type LIKE '%Упаковка%'
      ORDER BY operation_date DESC
    `;

    console.table(result.recordset.map(r => ({
      ID: r.operation_id,
      ФИО: r.fio?.substring(0, 15),
      Участок: r.participant_area,
      Тип: r.operation_type,
      АЕИ: r.aei_count?.toFixed(2),
      'Расц.': r.rate?.toFixed(2),
      'Сумма': r.base_amount?.toFixed(2),
      'OK': Math.abs(r.base_amount - r.expected) < 0.01 ? '✅' : '❌'
    })));

    console.log('\n✅ Все views пересозданы успешно!');
    
    await sql.close();
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    process.exit(1);
  }
}

main();
