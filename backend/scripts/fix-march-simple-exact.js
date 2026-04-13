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
  { fio: 'Долматов Илья Анатольевич', empId: '75649', expected: 49482 },
  { fio: 'Абдумаликов Шомурод Абдумаликович', empId: '78423', expected: 92230 },
  { fio: 'Храпов Максим Сергеевич', empId: '78692', expected: 137166 + 3825 },
  { fio: 'Бердников Артём Александрович', empId: '87615', expected: 43859 },
  { fio: 'Гозиев Куёшбек Абдурахимович', empId: '95682', expected: 2330 },
  { fio: 'Денисов Юрий Васильевич', empId: '78796', expected: 90689 },
  { fio: 'Дозорец Алексей Евгеньевич', empId: '84660', expected: 131242 },
  { fio: 'Надралиев Ермек Бисимбаевич', empId: '85765', expected: 115429 },
  { fio: 'Захаров Михаил Михайлович', empId: '22732', expected: 101984 },
  { fio: 'Иксанов Рафаэль Нафисович', empId: '84779', expected: 124107 },
  { fio: 'Кулешов Александр Владимирович', empId: '92115', expected: 75873 },
  { fio: 'Тупелекин Денис Александрович', empId: '64694', expected: 46496 },
  { fio: 'Миронов Виталий Владимирович', empId: '22178', expected: 73035 + 30600 },
  { fio: 'Мищенков Дмитрий Евгеньевич', empId: '99383', expected: 89975 },
  { fio: 'Новиков Александр Викторович', empId: '43743', expected: 56753 },
  { fio: 'Синельщиков Алексей Анатольевич', empId: '17004', expected: 137394 + 4463 },
  { fio: 'Сопов Александр Васильевич', empId: '33678', expected: 31866 + 40800 },
  { fio: 'Таженов Серик Зейнуллиевич', empId: '83177', expected: 103121 },
  { fio: 'Турсунов Акрамжон Мирзомуродович', empId: '92963', expected: 84074 },
  { fio: 'Евчик Александр Андреевич', empId: '7101', expected: 83318 },
  { fio: 'Шуменко Александр Александрович', empId: '86717', expected: 3736 },
  { fio: 'Смирнов Александр Андрианович', empId: '100835', expected: 858 },
  { fio: 'Дмитриев Владимир Андреевич', empId: '70874', expected: 6251 }
];

async function run() {
  console.log('Подключение к БД...');
  const pool = await sql.connect(config);

  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  console.log('Удаление старых корректировок FIX_MARCH_SIMPLE...');
  await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .query(`
      DELETE FROM operations 
      WHERE wcr_code IN ('FIXMARCH', 'FIX_MARCH')
        AND operation_date >= @startDate AND operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE));
    `);

  console.log('Сбор текущих данных по пользователям...');
  const users = await pool.request()
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate', sql.VarChar(10), endDate)
    .query(`
      SELECT
        u.id AS user_id,
        u.employee_id,
        w.code AS warehouse_code,
        ISNULL(SUM(o.amount), 0) AS total_amount
      FROM users u
      LEFT JOIN warehouses w ON w.id = u.warehouse_id
      LEFT JOIN operations o ON o.user_id = u.id 
        AND o.operation_date >= @startDate 
        AND o.operation_date < DATEADD(DAY, 1, CAST(@endDate AS DATE))
        AND (o.wcr_code IS NULL OR o.wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIX_MARCH', 'FIXMARCH'))
      WHERE u.employee_id IN (${excelData.map(d => `'${d.empId.padStart(8, '0')}'`).join(', ')})
      GROUP BY u.id, u.employee_id, w.code
    `);

  const userMap = new Map();
  for (const row of users.recordset) {
    userMap.set(row.employee_id, row);
  }

  console.log('Вставка корректирующих операций...');
  for (const row of excelData) {
    const paddedEmpId = row.empId.padStart(8, '0');
    const user = userMap.get(paddedEmpId);
    if (!user) {
      console.error(`⚠️ Пользователь ${row.empId} (${row.fio}) не найден в БД.`);
      continue;
    }

    const currentAmount = Math.round(user.total_amount);
    let diff = row.expected - currentAmount;

    if (diff !== 0) {
      const wcrCode = 'FIXMARCH';

      await pool.request()
        .input('userId', sql.Int, user.user_id)
        .input('warehouseCode', sql.NVarChar(20), user.warehouse_code)
        .input('operationType', sql.NVarChar(100), wcrCode)
        .input('count', sql.Int, 0)
        .input('prodCount', sql.Int, 0)
        .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
        .input('amount', sql.Float, diff)
        .input('wcrCode', sql.NVarChar(50), wcrCode)
        .query(`
          INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
          VALUES (@userId, @warehouseCode, @operationType, @count, @prodCount, 0, @operationDate, @amount, 'FIX_MARCH', @wcrCode)
        `);
      
      console.log(`✅ ${row.fio}: добавлена операция ${wcrCode}. Корректировка: ${diff} ₽ (было ${currentAmount}, стало ${row.expected})`);
    } else {
      console.log(`🆗 ${row.fio}: сумма совпадает (${row.expected}), корректировка не требуется.`);
    }
  }

  console.log('Готово!');
  await pool.close();
}

run().catch(console.error);