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

async function checkCronStatus() {
  try {
    console.log('🔍 ПРОВЕРКА СТАТУСА АВТОМАТИЧЕСКОЙ СИНХРОНИЗАЦИИ\n');
    console.log('='.repeat(70));

    await sql.connect(config);

    // 1. Последняя синхронизация
    console.log('\n📅 Последние синхронизации (из sync_logs):');
    console.log('-'.repeat(70));
    
    const lastSyncs = await sql.query`
      SELECT TOP 5
        warehouse_code,
        sync_date,
        operations_count,
        status,
        error_message,
        created_at
      FROM sync_logs
      ORDER BY created_at DESC
    `;

    if (lastSyncs.recordset.length === 0) {
      console.log('⚠️ НЕТ ЗАПИСЕЙ О СИНХРОНИЗАЦИИ!');
      console.log('   Возможно, cron НЕ ЗАПУСКАЕТСЯ или модуль не работает\n');
    } else {
      console.table(lastSyncs.recordset.map(r => ({
        Склад: r.warehouse_code,
        'Дата синхр.': r.sync_date?.toISOString()?.split('T')[0],
        Операций: r.operations_count,
        Статус: r.status,
        Когда: r.created_at?.toISOString()?.replace('T', ' ')?.substring(0, 19)
      })));
    }

    // 2. Последние добавленные операции
    console.log('\n📊 Последние добавленные операции:');
    console.log('-'.repeat(70));
    
    const lastOps = await sql.query`
      SELECT TOP 10
        warehouse_code,
        operation_date,
        operation_type,
        COUNT(*) as count,
        MAX(created_at) as last_added
      FROM operations
      GROUP BY warehouse_code, operation_date, operation_type
      ORDER BY MAX(created_at) DESC
    `;

    console.table(lastOps.recordset.map(r => ({
      Склад: r.warehouse_code,
      'Дата опер.': r.operation_date?.toISOString()?.split('T')[0],
      Тип: r.operation_type?.substring(0, 20),
      'Кол-во': r.count,
      'Добавлено': r.last_added?.toISOString()?.replace('T', ' ')?.substring(0, 19)
    })));

    // 3. Статистика по дням
    console.log('\n📈 Статистика добавления операций по дням:');
    console.log('-'.repeat(70));
    
    const dailyStats = await sql.query`
      SELECT 
        CAST(created_at AS DATE) as day,
        COUNT(*) as operations_added,
        COUNT(DISTINCT warehouse_code) as warehouses,
        MIN(created_at) as first_sync,
        MAX(created_at) as last_sync
      FROM operations
      WHERE created_at >= DATEADD(DAY, -7, GETDATE())
      GROUP BY CAST(created_at AS DATE)
      ORDER BY day DESC
    `;

    console.table(dailyStats.recordset.map(r => ({
      День: r.day?.toISOString()?.split('T')[0],
      'Операций': r.operations_added,
      'Складов': r.warehouses,
      'Первая синхр.': r.first_sync?.toISOString()?.substring(11, 19),
      'Последняя': r.last_sync?.toISOString()?.substring(11, 19)
    })));

    console.log('\n' + '='.repeat(70));
    console.log('📋 ВЫВОДЫ:');
    console.log('='.repeat(70));
    
    const lastSync = lastSyncs.recordset[0];
    if (!lastSync) {
      console.log('❌ ПРОБЛЕМА: Нет записей о синхронизации!');
      console.log('   Решение:');
      console.log('   1. Проверьте, что PM2 запущен: pm2 list');
      console.log('   2. Проверьте логи: pm2 logs salary-monitor-backend');
      console.log('   3. Проверьте, что ScheduleModule подключен в app.module.ts');
      console.log('   4. Запустите ручную синхронизацию: POST /api/sap/sync\n');
    } else {
      const hoursSinceSync = (new Date() - new Date(lastSync.created_at)) / (1000 * 60 * 60);
      
      if (hoursSinceSync > 26) {
        console.log('⚠️ ВНИМАНИЕ: Последняя синхронизация была >26 часов назад!');
        console.log(`   Последняя синхронизация: ${lastSync.created_at?.toISOString()?.replace('T', ' ')?.substring(0, 19)}`);
        console.log('   Cron должен запускаться каждый день в 02:00');
        console.log('   Проверьте PM2 логи на наличие ошибок!\n');
      } else {
        console.log('✅ Синхронизация работает нормально');
        console.log(`   Последняя синхронизация: ${lastSync.created_at?.toISOString()?.replace('T', ' ')?.substring(0, 19)}`);
        console.log(`   Часов назад: ${hoursSinceSync.toFixed(1)}\n`);
      }
    }

    await sql.close();
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    process.exit(1);
  }
}

checkCronStatus();
