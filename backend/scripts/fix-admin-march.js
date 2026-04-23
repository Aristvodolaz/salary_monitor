const sql = require('mssql');

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

// Данные из скриншота
const expectedData = [
  { empId: '00089780', expected: 5325, fio: 'Абдиали кызы Бегайым' },
  { empId: '00089916', expected: 69817, fio: 'Ахунали кызы Дамира' },
  { empId: '00098670', expected: 96738, fio: 'Баймуратов Уланбек Талантбекович' },
  { empId: '00100022', expected: 70704, fio: 'Байыш кызы Сайкал' },
  { empId: '00100474', expected: 79579, fio: 'Богданова Елена Николаевна' },
  { empId: '00090689', expected: 90525, fio: 'Брюханова Светлана Владимировна' },
  { empId: '00099616', expected: 90525, fio: 'Гуляева Юлия Юрьевна' },
  { empId: '00070874', expected: 92300, fio: 'Дмитриев Владимир Андреевич' },
  { empId: '00077099', expected: 142809, fio: 'Евстигнеева Любовь Юрьевна' },
  { empId: '00090888', expected: 31654, fio: 'Жолдошова Майрамгул Бейшенкуловна' },
  { empId: '00085760', expected: 115958, fio: 'Канищева Светлана Николаевна' },
  { empId: '00084310', expected: 91413, fio: 'Канчурина Фанзиля Басировна' },
  { empId: '00100481', expected: 92596, fio: 'Каримова Ирина Викторовна' },
  { empId: '00095521', expected: 91413, fio: 'Козлова Галина Михайловна' },
  { empId: '00080976', expected: 74550, fio: 'Кузовкова Ольга Вячеславовна' },
  { empId: '00086803', expected: 43783, fio: 'Лайер Александр Александрович' },
  { empId: '00085916', expected: 61511, fio: 'Логиновская Екатерина Борисовна' },
  { empId: '00011031', expected: 88454, fio: 'Лутошкин Михаил Вячеславович' },
  { empId: '00074506', expected: 89046, fio: 'Макарова Елена Николаевна' },
  { empId: '00092118', expected: 161078, fio: 'Малинина Вера Сергеевна' },
  { empId: '00096204', expected: 92300, fio: 'Мамырбекова Нурзат Мэлсбековна' },
  { empId: '00100025', expected: 83721, fio: 'Медерова Каныкей' },
  { empId: '00080792', expected: 96080, fio: 'Миллер Ольга Владимировна' },
  { empId: '00079442', expected: 90821, fio: 'Мисюля Елена Ивановна' },
  { empId: '00092133', expected: 121307, fio: 'Нестеренко Екатерина Николаевна' },
  { empId: '00101444', expected: 67154, fio: 'Никотин Сергей Витальевич' },
  { empId: '00091959', expected: 55321, fio: 'Ноокенбаева Чолпонай Анарбековна' },
  { empId: '00076947', expected: 42304, fio: 'Потапова Татьяна Владимировна' },
  { empId: '00088619', expected: 89046, fio: 'Сапрыкина Светлана Зиновьевна' },
  { empId: '00100835', expected: 92004, fio: 'Смирнов Александр Андрианович' },
  { empId: '00092653', expected: 87863, fio: 'Соколова Светлана Николаевна' },
  { empId: '00094235', expected: 88750, fio: 'Стоякин Александр Викторович' },
  { empId: '00100116', expected: 56800, fio: 'Суркова Татьяна Дмитриевна' },
  { empId: '00044591', expected: 87046, fio: 'Трифонов Николай Евгеньевич' },
  { empId: '00100198', expected: 81650, fio: 'Фомина Анастасия Александровна' },
  { empId: '00105095', expected: 90229, fio: 'Шакирбаева Айгерим Зарлыковна' },
  { empId: '00086717', expected: 37779, fio: 'Шуменко Александр Александрович' }
];

async function main() {
  console.log('Подключение к БД...');
  const pool = await sql.connect(DB);
  
  try {
    // Получаем текущие данные по всем сотрудникам из списка для сравнения с учетом всего за месяц (админ панель)
    const empIdsStr = expectedData.map(d => `'${d.empId}'`).join(', ');
    
    // В админ-панели отображается общая сумма (Сдельная ЗП + Фиксированные доплаты и т.д.)
    // Нас интересует столбец "Итого за месяц" - это v_salary_by_month.total_amount
    const query = `
      SELECT 
        u.id AS user_id,
        u.employee_id,
        u.fio,
        w.code as warehouse_code,
        ISNULL(vs.total_amount, 0) as current_total
      FROM users u
      LEFT JOIN warehouses w ON u.warehouse_id = w.id
      LEFT JOIN v_salary_by_month vs ON u.employee_id = vs.employee_id 
        AND vs.year = 2026 AND vs.month = 3
      WHERE u.employee_id IN (${empIdsStr})
    `;
    
    const usersRes = await pool.request().query(query);
    const userMap = new Map();
    for (const u of usersRes.recordset) {
      userMap.set(u.employee_id, u);
    }
    
    let wcrCode = 'FIX_MARCH'; // wcr_code is varchar(20), so FIX_MARCH_ADMIN is too long
    
    // Убедимся, что норма существует
    const checkNorm = await pool.request()
      .input('wcrCode', sql.NVarChar(50), wcrCode)
      .query(`SELECT 1 FROM wcr_norms WHERE wcr_code = @wcrCode`);
      
    if (checkNorm.recordset.length === 0) {
      await pool.request()
        .input('wcrCode', sql.NVarChar(50), wcrCode)
        .query(`
          INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
          VALUES (@wcrCode, 'Корректировка итога за март', 'Корректировка', 1, 1)
        `);
    }
    
    // Удаляем старые корректировки этого типа
    await pool.request()
      .input('wcrCode', sql.NVarChar(50), wcrCode)
      .query(`
        DELETE FROM operations WHERE wcr_code = @wcrCode AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01';
        DELETE FROM norms_operations WHERE wcr_code = @wcrCode AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01';
      `);

    console.log('Вставка корректирующих операций...');
    
    for (const row of expectedData) {
      const user = userMap.get(row.empId);
      if (!user) {
        console.error(`⚠️ Пользователь ${row.empId} (${row.fio}) не найден в БД.`);
        continue;
      }

      const diff = row.expected - user.current_total;

      if (Math.abs(diff) > 0.01) {
        // Мы используем кол-во 1 и сумму diff, чтобы напрямую повлиять на итог
        await pool.request()
          .input('userId', sql.Int, user.user_id)
          .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
          .input('operationType', sql.NVarChar(100), wcrCode)
          .input('count', sql.Int, 1) // или diff, но проще 1, если tariff.rate = diff, или мы обходим tariff?
          // Для admin панели проще вставить запись напрямую в operations.
          // ВНИМАНИЕ: v_salary_details использует ISNULL(t.rate, 0) для вычисления amount?
          // Нет, в fix-views.sql: ISNULL(o.amount, 0) AS base_amount
          // Значит, o.amount работает напрямую, если мы его зададим.
          .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
          .input('amount', sql.Float, diff)
          .input('wcrCode', sql.NVarChar(50), wcrCode)
          .query(`
            INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, 1, 0, 0, @operationDate, @amount, 'FIX_ADMIN_MARCH', @wcrCode)
          `);
          
        console.log(`✅ ${row.fio}: корректировка ${diff.toFixed(2)} ₽ (было ${user.current_total.toFixed(2)}, стало ${row.expected})`);
      } else {
        console.log(`🆗 ${row.fio}: совпадает (${row.expected}).`);
      }
    }
    
    console.log('Готово!');
    
  } catch (e) {
    console.error('Ошибка:', e);
  } finally {
    await pool.close();
  }
}

main();