/**
 * Скрипт для обновления ФИО пользователей из SAP
 * Запрашивает данные за последние 2 дня по всем складам
 */

const axios = require('axios');
const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
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

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: {
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD
  },
  timeout: 120000 // 2 минуты
});

async function updateUserNames() {
  try {
    console.log('🔄 ОБНОВЛЕНИЕ ФИО ПОЛЬЗОВАТЕЛЕЙ ИЗ SAP\n');
    console.log('='.repeat(70));
    console.log('📅 Запрос данных за последние 2 дня\n');

    await sql.connect(dbConfig);
    console.log('✅ Подключено к БД\n');

    // Получаем список активных складов
    const warehousesQuery = `SELECT code, name FROM warehouses WHERE is_active = 1`;
    const warehouses = await sql.query(warehousesQuery);
    console.log(`📦 Активных складов: ${warehouses.recordset.length}\n`);

    // Формируем даты для запроса (последние 2 дня)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 2);

    const formatDate = (date) => date.toISOString().split('.')[0];
    
    // Хранилище уникальных пользователей { employeeId: { name1, name2 } }
    const employeeNames = new Map();

    // Запрашиваем данные по каждому складу
    for (const warehouse of warehouses.recordset) {
      try {
        console.log(`\n📦 Склад: ${warehouse.code} (${warehouse.name})`);
        
        const filter = `$filter=(Lgnum eq '${warehouse.code}' and (ConfirmedDate ge datetime'${formatDate(startDate)}' and ConfirmedDate le datetime'${formatDate(endDate)}'))`;
        const url = `/WHOSet?${filter}`;
        
        console.log(`   🔍 Запрос к SAP...`);
        const response = await axiosInstance.get(url);
        const results = response.data?.d?.results || [];
        
        console.log(`   📊 Получено записей: ${results.length}`);

        // Собираем уникальные employee_id с их именами
        let newNames = 0;
        for (const item of results) {
          const employeeId = item.Employeeid || item.Processor;
          const lastName = (item.McName1 || '').trim();
          const firstName = (item.McName2 || '').trim();
          
          if (employeeId && (lastName || firstName)) {
            if (!employeeNames.has(employeeId)) {
              employeeNames.set(employeeId, { lastName, firstName });
              newNames++;
            }
          }
        }
        
        console.log(`   ✅ Найдено уникальных сотрудников: ${newNames}`);
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`   ❌ Ошибка: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 Всего уникальных сотрудников с ФИО: ${employeeNames.size}\n`);

    if (employeeNames.size === 0) {
      console.log('⚠️ Не найдено данных для обновления!');
      await sql.close();
      return;
    }

    // Обновляем ФИО в БД
    console.log('💾 Обновление данных в БД...\n');
    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const [employeeId, names] of employeeNames.entries()) {
      try {
        const fullName = `${names.lastName} ${names.firstName}`.trim();
        
        // Проверяем существует ли пользователь
        const userCheck = await sql.query`
          SELECT id, fio FROM users WHERE employee_id = ${employeeId}
        `;

        if (userCheck.recordset.length > 0) {
          const currentFio = userCheck.recordset[0].fio;
          
          // Обновляем только если ФИО изменилось или было заглушкой
          if (currentFio !== fullName && 
              (currentFio.startsWith('Сотрудник ') || !currentFio)) {
            await sql.query`
              UPDATE users 
              SET fio = ${fullName}, updated_at = GETDATE()
              WHERE employee_id = ${employeeId}
            `;
            console.log(`  ✅ ${employeeId}: "${currentFio}" → "${fullName}"`);
            updated++;
          } else {
            skipped++;
          }
        }
        
      } catch (error) {
        console.error(`  ❌ ${employeeId}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 СТАТИСТИКА:');
    console.log('='.repeat(70));
    console.log(`✅ Обновлено: ${updated}`);
    console.log(`⚠️ Не найдено: ${notFound}`);
    console.log(`📋 Всего обработано: ${users.recordset.length}\n`);

    // Показываем обновленных пользователей
    if (updated > 0) {
      console.log('📋 Обновленные пользователи:');
      console.log('-'.repeat(70));
      
      const updatedUsers = await sql.query`
        SELECT employee_id, fio, updated_at
        FROM users
        WHERE updated_at >= DATEADD(MINUTE, -5, GETDATE())
        ORDER BY updated_at DESC
      `;
      
      console.table(updatedUsers.recordset.map(u => ({
        'ID': u.employee_id,
        'ФИО': u.fio,
        'Обновлено': u.updated_at?.toISOString()?.replace('T', ' ')?.substring(0, 19)
      })));
    }

    await sql.close();
    console.log('\n✅ ОБНОВЛЕНИЕ ЗАВЕРШЕНО!\n');

  } catch (err) {
    console.error('\n❌ Критическая ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

updateUserNames();
