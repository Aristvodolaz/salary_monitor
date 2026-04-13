const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};

const excelData = [
  { fio: 'Абдиали кызы Бегайым', empId: '89780', expected: 5325 },
  { fio: 'Ахунали кызы Дамира', empId: '89916', expected: 69817 },
  { fio: 'Баймуратов Уланбек Талантбекович', empId: '98670', expected: 96738 },
  { fio: 'Байыш кызы Сайкал', empId: '100022', expected: 70704 },
  { fio: 'Богданова Елена Николаевна', empId: '100474', expected: 79579 },
  { fio: 'Брюханова Светлана Владимировна', empId: '90689', expected: 90525 },
  { fio: 'Гуляева Юлия Юрьевна', empId: '99616', expected: 90525 },
  { fio: 'Дмитриев Владимир Андреевич', empId: '70874', expected: 92300 },
  { fio: 'Евстигнеева Любовь Юрьевна', empId: '77099', expected: 142809 },
  { fio: 'Жолдошова Майрамгул Бейшенкул', empId: '90888', expected: 31654 },
  { fio: 'Канищева Светлана Николаевна', empId: '85760', expected: 115958 },
  { fio: 'Канчурина Фанзиля Басировна', empId: '84310', expected: 91413 },
  { fio: 'Каримова Ирина Викторовна', empId: '100481', expected: 92596 },
  { fio: 'Козлова Галина Михайловна', empId: '95521', expected: 91413 },
  { fio: 'Кузовкова Ольга Вячеславовна', empId: '80976', expected: 74550 },
  { fio: 'Лайер Александр Александрович', empId: '86803', expected: 43783 },
  { fio: 'Логиновская Екатерина Борисовна', empId: '85916', expected: 61511 },
  { fio: 'Лутошкин Михаил Вячеславович', empId: '11031', expected: 88454 },
  { fio: 'Макарова Елена Николаевна', empId: '74506', expected: 89046 },
  { fio: 'Малинина Вера Сергеевна', empId: '92118', expected: 161078 },
  { fio: 'Мамырбекова Нурзат Мэлсбековна', empId: '96204', expected: 92300 },
  { fio: 'Медерова Каныкей', empId: '100025', expected: 83721 },
  { fio: 'Миллер Ольга Владимировна', empId: '80792', expected: 96080 },
  { fio: 'Мисюля Елена Ивановна', empId: '79442', expected: 90821 },
  { fio: 'Нестеренко Екатерина Николаевна', empId: '92133', expected: 121307 },
  { fio: 'Никотин Сергей Витальевич', empId: '101444', expected: 67154 },
  { fio: 'Ноокенбаева Чолпонай Анарбековна', empId: '91959', expected: 55321 },
  { fio: 'Потапова Татьяна Владимировна', empId: '76947', expected: 42304 },
  { fio: 'Сапрыкина Светлана Зиновьевна', empId: '88619', expected: 89046 },
  { fio: 'Смирнов Александр Андрианович', empId: '100835', expected: 92004 },
  { fio: 'Соколова Светлана Николаевна', empId: '92653', expected: 87863 },
  { fio: 'Стоякин Александр Викторович', empId: '94235', expected: 88750 },
  { fio: 'Суркова Татьяна Дмитриевна', empId: '100116', expected: 56800 },
  { fio: 'Трифонов Николай Евгеньевич', empId: '44591', expected: 87046 },
  { fio: 'Фомина Анастасия Александровна', empId: '100198', expected: 81650 },
  { fio: 'Шакирбаева Айгерим Зарлыковна', empId: '105095', expected: 90229 },
  { fio: 'Шуменко Александр Александрович', empId: '86717', expected: 37779 }
];

async function run() {
  console.log('Подключение к БД...');
  const pool = await sql.connect(config);

  console.log('Удаление старых корректировок (FIXAEIMAR, FIXPCKMAR)...');
  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .query(`
      DELETE FROM operations 
      WHERE (wcr_code = 'FIXAEIMAR' OR wcr_code = 'FIXPCKMAR')
        AND operation_date >= @startDate AND operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE));
        
      DELETE FROM norms_operations 
      WHERE (wcr_code = 'FIXAEIMAR' OR wcr_code = 'FIXPCKMAR')
        AND operation_date >= @startDate AND operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE));
    `);

  console.log('Сбор текущих данных по пользователям для отчета "Приемка и Хранение"...');
  
  // Get all users in the DB
  const usersRes = await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .query(`
      SELECT
        u.id AS user_id,
        u.employee_id,
        u.fio,
        w.code AS warehouse_code,
        ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL AND o.wcr_code NOT LIKE 'FIX%' THEN o.amount ELSE 0 END), 0) +
        ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NOT NULL AND o.wcr_code NOT LIKE 'FIX%'
                        THEN ISNULL(o.prod_count, 0) * wp.rate ELSE 0 END), 0) AS current_total
      FROM users u
      LEFT JOIN warehouses w ON w.id = u.warehouse_id
      LEFT JOIN operations o ON o.user_id = u.id AND o.operation_date >= @startDate AND o.operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE))
      LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
      GROUP BY u.id, u.employee_id, u.fio, w.code
    `);

  const userMap = new Map();
  for (const row of usersRes.recordset) {
    userMap.set(row.employee_id, row);
  }

  console.log('Вставка корректирующих операций для соответствия таблице...');
  let totalDiff = 0;

  for (const row of excelData) {
    const paddedEmpId = row.empId.padStart(8, '0');
    const user = userMap.get(paddedEmpId);
    if (!user) {
      console.error(`⚠️ Пользователь ${row.empId} (${row.fio}) не найден в БД.`);
      continue;
    }

    const currentAmount = user.current_total;
    let diff = row.expected - currentAmount;
    
    // We want the total to be exactly `expected`.
    // Since amount is stored as float, we might have small discrepancies. We'll round the difference to 2 decimals.
    diff = Math.round(diff * 100) / 100;

    if (Math.abs(diff) > 0.01) {
      const wcrCode = 'FIXAEIMAR';
      const amount = diff;

      await pool.request()
        .input('userId', sql.Int, user.user_id)
        .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
        .input('operationType', sql.NVarChar(100), wcrCode)
        .input('count', sql.Int, 1)
        .input('prodCount', sql.Int, 0)
        .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
        .input('amount', sql.Float, amount)
        .input('wcrCode', sql.NVarChar(50), wcrCode)
        .query(`
          INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
          VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
        `);
        
      await pool.request()
        .input('userId', sql.Int, user.user_id)
        .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
        .input('operationType', sql.NVarChar(100), wcrCode)
        .input('count', sql.Int, 1)
        .input('prodCount', sql.Int, 0)
        .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
        .input('amount', sql.Float, amount)
        .input('wcrCode', sql.NVarChar(50), wcrCode)
        .query(`
          INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
          VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
        `);
      
      console.log(`✅ ${row.fio}: добавлена операция ${wcrCode}. Корректировка: ${diff} ₽ (было ${currentAmount.toFixed(2)}, стало ${row.expected})`);
      totalDiff += diff;
    } else {
      console.log(`🆗 ${row.fio}: сумма совпадает (${row.expected}), корректировка не требуется.`);
    }
  }

  // Set all other employees to 0 for "Приемка и Хранение" by applying negative correction if they have > 0
  for (const user of usersRes.recordset) {
    if (!excelData.find(d => d.empId.padStart(8, '0') === user.employee_id)) {
      if (user.current_total > 0.01) {
        const wcrCode = 'FIXAEIMAR';
        const amount = -user.current_total;
        
        await pool.request()
          .input('userId', sql.Int, user.user_id)
          .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
          .input('operationType', sql.NVarChar(100), wcrCode)
          .input('count', sql.Int, 1)
          .input('prodCount', sql.Int, 0)
          .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
          .input('amount', sql.Float, amount)
          .input('wcrCode', sql.NVarChar(50), wcrCode)
          .query(`
            INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
          `);
          
        await pool.request()
          .input('userId', sql.Int, user.user_id)
          .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
          .input('operationType', sql.NVarChar(100), wcrCode)
          .input('count', sql.Int, 1)
          .input('prodCount', sql.Int, 0)
          .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
          .input('amount', sql.Float, amount)
          .input('wcrCode', sql.NVarChar(50), wcrCode)
          .query(`
            INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
          `);
        console.log(`✅ ${user.fio}: обнулена сумма для отчета (-${user.current_total.toFixed(2)})`);
      }
    }
  }

  console.log(`Всего откорректировано: ${totalDiff.toFixed(2)} ₽`);
  pool.close();
}

run().catch(console.error);