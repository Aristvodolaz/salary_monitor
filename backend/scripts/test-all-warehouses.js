const axios = require('axios');
const sql = require('mssql');

// Конфигурация БД
const dbConfig = {
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

// SAP конфигурация
const sapConfig = {
  baseUrl: 'http://dwm-app.komus.net:8001/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV',
  username: 'TEST_19238',
  password: 'TEST_19238_qa',
};

async function testAllWarehouses() {
  console.log('🏢 Тестирование синхронизации по всем складам...\n');

  let pool;

  try {
    // Подключение к БД
    console.log('🔌 Подключение к БД...');
    pool = await sql.connect(dbConfig);
    console.log('✅ Подключено!\n');

    // Получаем список складов
    const result = await pool.request().query(`
      SELECT code, name, is_active FROM warehouses ORDER BY code
    `);
    const warehouses = result.recordset;

    console.log(`📦 Найдено складов: ${warehouses.length}\n`);

    // Тестируем каждый склад
    const stats = [];

    for (const warehouse of warehouses) {
      if (!warehouse.is_active) {
        console.log(`⏭️  ${warehouse.code} (${warehouse.name}) - неактивен, пропускаем`);
        continue;
      }

      console.log(`📡 Тест: ${warehouse.code} - ${warehouse.name}`);

      try {
        // Формируем запрос (за последний месяц для теста)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        const filter = `(Lgnum eq '${warehouse.code}' and (ConfirmedDate ge datetime'${startDate.toISOString().split('.')[0]}' and ConfirmedDate le datetime'${endDate.toISOString().split('.')[0]}'))`;
        const url = `${sapConfig.baseUrl}/WHOSet?$filter=${filter}`;

        const response = await axios.get(url, {
          auth: {
            username: sapConfig.username,
            password: sapConfig.password,
          },
          timeout: 30000,
          headers: { 'Accept': 'application/json' },
        });

        const count = response.data?.d?.results?.length || 0;
        console.log(`   ✅ Получено операций: ${count}`);

        stats.push({
          code: warehouse.code,
          name: warehouse.name,
          count: count,
          status: 'success',
        });

      } catch (error) {
        const status = error.response?.status || 'network error';
        console.log(`   ❌ Ошибка: ${status}`);
        
        stats.push({
          code: warehouse.code,
          name: warehouse.name,
          count: 0,
          status: `error: ${status}`,
        });
      }

      console.log('');
    }

    // Итоговая статистика
    console.log('\n📊 Итоговая статистика:\n');
    console.table(stats);

    const totalOperations = stats.reduce((sum, s) => sum + s.count, 0);
    const successCount = stats.filter(s => s.status === 'success').length;

    console.log(`\n✅ Успешно: ${successCount}/${warehouses.filter(w => w.is_active).length} складов`);
    console.log(`📋 Всего операций: ${totalOperations}`);

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

testAllWarehouses();
