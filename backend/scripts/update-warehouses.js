const sql = require('mssql');

// Конфигурация подключения
const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',  // БД где созданы таблицы
  user: 'sa',
  password: 'icY2eGuyfU',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// Склады с правильными названиями
const warehouses = [
  { code: '01SS', name: 'СК Поларис' },
  { code: '02DQ', name: 'СК ДМ офисный товар' },
  { code: '02SR', name: 'РРЦ Южный Урал' },
  { code: '0SK1', name: 'СК Пермь' },
  { code: '0SK2', name: 'СК Омск' },
  { code: '0SK5', name: 'СК Новосибирск' },
  { code: '0SK6', name: 'СК Шушары' },
  { code: '0SK8', name: 'СК Урал-Каскад' },
  { code: '0SK9', name: 'СК Урал-Мебель' },
  { code: 'RR04', name: 'РСД 4 ФУС' },
];

async function updateWarehouses() {
  console.log('🏢 Обновление списка складов...\n');
  
  let pool;
  
  try {
    // Подключение к БД
    console.log('🔌 Подключение к SQL Server...');
    pool = await sql.connect(config);
    console.log('✅ Подключено!\n');

    // Обновление каждого склада
    for (const warehouse of warehouses) {
      try {
        const result = await pool.request()
          .input('code', sql.NVarChar(10), warehouse.code)
          .input('name', sql.NVarChar(255), warehouse.name)
          .query(`
            UPDATE warehouses 
            SET name = @name 
            WHERE code = @code
          `);

        if (result.rowsAffected[0] > 0) {
          console.log(`✅ ${warehouse.code}: ${warehouse.name}`);
        } else {
          console.log(`⚠️  ${warehouse.code}: не найден в БД, пропускаем`);
        }
      } catch (error) {
        console.error(`❌ Ошибка обновления ${warehouse.code}:`, error.message);
      }
    }

    console.log('\n🎉 Обновление завершено!');
    console.log('\n📋 Проверка результата:');
    
    // Показать все склады
    const result = await pool.request().query('SELECT code, name FROM warehouses ORDER BY code');
    console.table(result.recordset);
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

updateWarehouses();
