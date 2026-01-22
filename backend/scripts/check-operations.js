const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function checkOperations() {
  console.log('📊 Проверка операций в БД...\n');

  let pool;

  try {
    pool = await sql.connect(config);

    // 1. Общее количество
    const totalRes = await pool.request().query(`
      SELECT COUNT(*) as total FROM operations
    `);
    console.log(`📋 Всего операций в БД: ${totalRes.recordset[0].total}\n`);

    // 2. По складам
    const byWarehouse = await pool.request().query(`
      SELECT 
        w.code,
        w.name,
        COUNT(o.id) as operations_count,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_amount
      FROM warehouses w
      LEFT JOIN operations o ON w.code = o.warehouse_code
      GROUP BY w.code, w.name
      ORDER BY w.code
    `);
    
    console.log('📦 Операции по складам:\n');
    console.table(byWarehouse.recordset);

    // 3. Последние 5 операций
    const recentRes = await pool.request().query(`
      SELECT TOP 5
        o.id,
        u.employee_id,
        u.fio,
        w.name as warehouse,
        o.operation_type,
        o.count,
        o.amount,
        o.operation_date,
        o.created_at
      FROM operations o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN warehouses w ON o.warehouse_code = w.code
      ORDER BY o.created_at DESC
    `);

    console.log('\n🕐 Последние 5 операций:\n');
    console.table(recentRes.recordset);

    // 4. Статистика синхронизации
    const syncLogs = await pool.request().query(`
      SELECT TOP 5
        warehouse_code,
        sync_start,
        status,
        records_processed,
        DATEDIFF(SECOND, sync_start, sync_end) as duration_sec
      FROM sync_logs
      ORDER BY sync_start DESC
    `);

    console.log('\n📝 Логи синхронизации:\n');
    console.table(syncLogs.recordset);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

checkOperations();
