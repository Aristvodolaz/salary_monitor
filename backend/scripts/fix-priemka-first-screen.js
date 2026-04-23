const sql = require('mssql');

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

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
  const pool = await sql.connect(DB);
  
  try {
    const empIdsStr = expectedData.map(d => `'${d.empId}'`).join(', ');
    
    // Получаем текущую сумму по Приемке и хранению (исключая FIXAEIMAR, чтобы заново его пересоздать)
    const query = `
      SELECT 
        u.id AS user_id,
        u.employee_id,
        u.fio,
        w.code as warehouse_code,
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL AND o.wcr_code != 'FIXAEIMAR' THEN o.amount ELSE 0 END), 0) AS current_total
      FROM users u
      LEFT JOIN warehouses w ON u.warehouse_id = w.id
      LEFT JOIN operations o ON u.id = o.user_id AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      LEFT JOIN wcr_norms wn ON o.wcr_code = wn.wcr_code
      WHERE u.employee_id IN (${empIdsStr})
      GROUP BY u.id, u.employee_id, u.fio, w.code
    `;
    
    const usersRes = await pool.request().query(query);
    const userMap = new Map();
    for (const u of usersRes.recordset) {
      userMap.set(u.employee_id, u);
    }
    
    // Удаляем старые корректировки FIXAEIMAR для этих сотрудников
    await pool.request().query(`
      DELETE o FROM operations o
      JOIN users u ON o.user_id = u.id
      WHERE u.employee_id IN (${empIdsStr}) AND o.wcr_code = 'FIXAEIMAR' AND o.operation_date >= '2026-03-01';
      
      DELETE no FROM norms_operations no
      JOIN users u ON no.user_id = u.id
      WHERE u.employee_id IN (${empIdsStr}) AND no.wcr_code = 'FIXAEIMAR' AND no.operation_date >= '2026-03-01';
    `);

    console.log('Вставка точечных корректировок Приемки (FIXAEIMAR)...');
    
    let wcrCode = 'FIXAEIMAR';
    let countAdjusted = 0;
    
    for (const row of expectedData) {
      const user = userMap.get(row.empId);
      if (!user) continue;

      const diff = row.expected - user.current_total;

      if (Math.abs(diff) > 0.01) {
        const count = Math.round(diff / 100.0);
        const amount = count * 100.0;

        await pool.request()
          .input('userId', sql.Int, user.user_id)
          .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
          .input('operationType', sql.NVarChar(100), wcrCode)
          .input('count', sql.Int, count)
          .input('prodCount', sql.Int, 0)
          .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
          .input('amount', sql.Float, amount)
          .input('wcrCode', sql.NVarChar(50), wcrCode)
          .query(`
            INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, 0, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode);
            
            INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, 0, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode);
          `);
          
        console.log(`✅ ${row.fio}: корректировка ${amount} ₽ (было ${user.current_total}, стало ${user.current_total + amount}) - цель: ${row.expected}`);
        countAdjusted++;
      }
    }
    
    console.log(`Успешно скорректировано: ${countAdjusted} чел.`);
    
  } catch (e) {
    console.error('Ошибка:', e);
  } finally {
    await pool.close();
  }
}

main();