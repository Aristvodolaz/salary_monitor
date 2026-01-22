const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Конфигурация подключения
const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SPOe_rc',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// Функция выполнения SQL-файла
async function executeSqlFile(pool, filePath) {
  console.log(`\n📄 Выполнение: ${path.basename(filePath)}`);
  
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  
  // Разделяем на батчи по GO (разные варианты)
  const batches = sqlContent
    .split(/^\s*GO\s*$/gmi)
    .map(batch => batch.trim())
    .filter(batch => {
      // Пропускаем пустые батчи и команды USE (они не поддерживаются в node-mssql)
      if (!batch || batch.length === 0) return false;
      if (batch.match(/^\s*USE\s+/i)) return false;
      return true;
    });

  for (let i = 0; i < batches.length; i++) {
    try {
      const batch = batches[i];
      if (batch.trim()) {
        await pool.request().query(batch);
        process.stdout.write('.');
      }
    } catch (error) {
      console.error(`\n❌ Ошибка в батче ${i + 1}:`, error.message);
      console.error('Батч:', batches[i].substring(0, 200));
      // Не прерываем выполнение, продолжаем
    }
  }
  
  console.log(' ✅ Готово!');
}

// Главная функция
async function initDatabase() {
  console.log('🚀 Инициализация базы данных SalaryMonitor...\n');
  
  let pool;
  
  try {
    // Подключение к БД
    console.log('🔌 Подключение к SQL Server...');
    pool = await sql.connect(config);
    console.log('✅ Подключено!\n');

    // Выполнение скриптов
    const databaseDir = path.join(__dirname, '../../database');
    
    await executeSqlFile(pool, path.join(databaseDir, 'schema.sql'));
    await executeSqlFile(pool, path.join(databaseDir, 'seed.sql'));
    await executeSqlFile(pool, path.join(databaseDir, 'views.sql'));

    console.log('\n🎉 База данных успешно инициализирована!');
    console.log('\n📋 Тестовые пользователи:');
    console.log('   Employee ID: 00000001 (Иванов) - employee');
    console.log('   Employee ID: 00000002 (Петров) - employee');
    console.log('   Employee ID: 00000003 (Сидорова) - employee');
    console.log('   Employee ID: 00000099 (Администратор) - admin');
    
  } catch (error) {
    console.error('\n❌ Ошибка инициализации:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

// Запуск
initDatabase();
