const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};

// Extracted from screenshot. Duplicates are summed.
// Храпов: 137166 + 3825 = 140991
// Миронов: 73035 + 30600 = 103635
// Синельщиков: 137394 + 4463 = 141857
// Сопов: 31866 + 40800 = 72666
const expectedData = [
  { fio: 'Долматов Илья Анатольевич', empId: '75649', expected: 49482 },
  { fio: 'Абдумаликов Шомурод Абдумалик', empId: '78423', expected: 92230 },
  { fio: 'Храпов Максим Сергеевич', empId: '78692', expected: 140991 },
  { fio: 'Бердников Артём Александрович', empId: '87615', expected: 43859 },
  { fio: 'Гозиев Куёшбек Абдурахимович', empId: '95682', expected: 2330 },
  { fio: 'Денисов Юрий Васильевич', empId: '78796', expected: 90689 },
  { fio: 'Дозорец Алексей Евгеньевич', empId: '84660', expected: 131242 },
  { fio: 'Надралиев Ермек Бисимбаевич', empId: '85765', expected: 115429 },
  { fio: 'Захаров Михаил Михайлович', empId: '22732', expected: 101984 },
  { fio: 'Иксанов Рафаэль Нафисович', empId: '84779', expected: 124107 },
  { fio: 'Кулешов Александр Владимирович', empId: '92115', expected: 75873 },
  { fio: 'Тупелекин Денис Александрович', empId: '64694', expected: 46496 },
  { fio: 'Миронов Виталий Владимирович', empId: '22178', expected: 103635 },
  { fio: 'Мищенков Дмитрий Евгеньевич', empId: '99383', expected: 89975 },
  { fio: 'Новиков Александр Викторович', empId: '43743', expected: 56753 },
  { fio: 'Синельщиков Алексей Анатольевич', empId: '17004', expected: 141857 },
  { fio: 'Сопов Александр Васильевич', empId: '33678', expected: 72666 },
  { fio: 'Таженов Серик Зейнуллиевич', empId: '83177', expected: 103121 },
  { fio: 'Турсунов Акрамжон Мирзомуродо', empId: '92963', expected: 84074 },
  { fio: 'Евчик Александр Андреевич', empId: '7101', expected: 83318 },
  { fio: 'Шуменко Александр Александрович', empId: '86717', expected: 3736 },
  { fio: 'Смирнов Александр Андрианович', empId: '100835', expected: 858 },
  { fio: 'Дмитриев Владимир Андреевич', empId: '70874', expected: 6251 },
];

async function run() {
  console.log('Подключение к БД...');
  const pool = await sql.connect(config);

  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  console.log('Удаление старых корректировок (FIXAEIMAR, FIXPCKMAR) для 02DQ...');
  await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .query(`
      DELETE FROM operations 
      WHERE (wcr_code = 'FIXAEIMAR' OR wcr_code = 'FIXPCKMAR')
        AND warehouse_code = '02DQ'
        AND operation_date >= @startDate AND operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE));
        
      DELETE FROM norms_operations 
      WHERE (wcr_code = 'FIXAEIMAR' OR wcr_code = 'FIXPCKMAR')
        AND warehouse_code = '02DQ'
        AND operation_date >= @startDate AND operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE));
    `);

  console.log('Сбор текущих данных по 02DQ для "Приемка и Хранение"...');
  
  // Get all 02DQ users in the DB
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
                        THEN ISNULL(o.prod_count, 0) * wp.rate
                        WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NULL AND o.wcr_code NOT LIKE 'FIX%'
                        THEN ISNULL(o.amount, 0)
                        ELSE 0 END), 0) AS current_total
      FROM users u
      JOIN warehouses w ON w.id = u.warehouse_id AND w.code = '02DQ'
      LEFT JOIN operations o ON o.user_id = u.id AND o.operation_date >= @startDate AND o.operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE))
      LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
      GROUP BY u.id, u.employee_id, u.fio, w.code
    `);

  const userMap = new Map();
  for (const row of usersRes.recordset) {
    userMap.set(row.employee_id, row);
  }

  console.log('Вставка новых корректирующих операций...');
  let totalDiff = 0;

  for (const row of expectedData) {
    const paddedEmpId = row.empId.padStart(8, '0');
    const user = userMap.get(paddedEmpId);
    if (!user) {
      console.error(`⚠️ Пользователь ${row.empId} (${row.fio}) не найден в 02DQ.`);
      continue;
    }

    const currentAmount = user.current_total;
    let diff = row.expected - currentAmount;
    diff = Math.round(diff * 100) / 100;

    if (Math.abs(diff) > 0.01) {
      const wcrCode = 'FIXAEIMAR';
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
          VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
        `);
        
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
          INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
          VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
        `);
      
      console.log(`✅ ${row.fio}: корректировка ${diff} ₽ (было ${currentAmount.toFixed(2)}, стало ${row.expected})`);
      totalDiff += diff;
    } else {
      console.log(`🆗 ${row.fio}: совпадает (${row.expected}).`);
    }
  }

  // Set all other 02DQ employees to 0 for "Приемка и Хранение"
  let zeroedCount = 0;
  for (const user of usersRes.recordset) {
    if (!expectedData.find(d => d.empId.padStart(8, '0') === user.employee_id)) {
      if (user.current_total > 0.01) {
        const wcrCode = 'FIXAEIMAR';
        const count = Math.round(-user.current_total / 100.0);
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
            VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
          `);

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
            INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
          `);
          
        zeroedCount++;
      }
    }
  }

  console.log(`Обнулено сотрудников не из отчета: ${zeroedCount}`);
  console.log(`\n✅ Обновление "Приемка и Хранение" 02DQ завершено!`);
  await pool.close();
}

run().catch(console.error);