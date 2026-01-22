const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};

async function fillSummary() {
  console.log('📊 Заполнение salary_summary...\n');
  
  let pool;
  try {
    pool = await sql.connect(config);
    
    // Очистка
    await pool.request().query('TRUNCATE TABLE salary_summary');
    console.log('✅ Таблица очищена');
    
    // Заполнение из view
    await pool.request().query(`
      INSERT INTO salary_summary (
        user_id, period_start, period_end, total_amount, quality_coefficient, errors_count
      )
      SELECT 
        user_id,
        period_start,
        EOMONTH(period_start) as period_end,
        total_amount,
        avg_quality_coefficient,
        0
      FROM v_salary_by_month
    `);
    
    const count = await pool.request().query('SELECT COUNT(*) as cnt FROM salary_summary');
    console.log(`✅ Добавлено записей: ${count.recordset[0].cnt}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

fillSummary();
