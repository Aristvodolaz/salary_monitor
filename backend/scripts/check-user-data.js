const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};

async function checkUserData() {
  console.log('🔍 Проверка данных пользователей...\n');

  let pool;
  try {
    pool = await sql.connect(config);

    // 1. Список пользователей с операциями
    const usersRes = await pool.request().query(`
      SELECT 
        u.employee_id,
        u.fio,
        w.name as warehouse,
        COUNT(o.id) as operations_count,
        SUM(o.count) as total_aei,
        SUM(o.amount) as total_salary
      FROM users u
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      LEFT JOIN operations o ON u.id = o.user_id 
        AND o.operation_date >= DATEADD(DAY, -7, GETDATE())
      GROUP BY u.employee_id, u.fio, w.name
      HAVING COUNT(o.id) > 0
      ORDER BY total_salary DESC
    `);

    console.log('👥 Пользователи с операциями за последние 7 дней:\n');
    console.table(usersRes.recordset.slice(0, 10));

    // 2. Проверка конкретного пользователя
    if (usersRes.recordset.length > 0) {
      const testUser = usersRes.recordset[0];
      console.log(`\n📊 Детализация для: ${testUser.employee_id} (${testUser.fio})\n`);

      const detailRes = await pool.request()
        .input('employeeId', testUser.employee_id)
        .query(`
          SELECT 
            o.operation_date,
            o.participant_area,
            o.operation_type,
            o.count as aei,
            o.amount,
            o.actdura
          FROM operations o
          INNER JOIN users u ON o.user_id = u.id
          WHERE u.employee_id = @employeeId
            AND o.operation_date >= DATEADD(DAY, -7, GETDATE())
          ORDER BY o.operation_date DESC
        `);

      console.table(detailRes.recordset.slice(0, 10));

      // 3. Тест API endpoint
      console.log('\n🌐 Тестирую API endpoint...\n');
      const axios = require('axios');

      try {
        // Авторизация
        const loginRes = await axios.post('http://localhost:3000/api/auth/barcode', {
          employeeId: testUser.employee_id
        });
        const token = loginRes.data.access_token;
        console.log('✅ Авторизация успешна');

        // Запрос зарплаты
        const salaryRes = await axios.get('http://localhost:3000/api/salary?period=month', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('\n💰 Ответ API /salary:');
        console.log(JSON.stringify(salaryRes.data, null, 2));

      } catch (apiError) {
        console.log('❌ Ошибка API:', apiError.response?.data || apiError.message);
      }
    } else {
      console.log('❌ Нет пользователей с операциями. Синхронизация еще не завершена.');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

checkUserData();
