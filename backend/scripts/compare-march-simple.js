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
  const pool = await sql.connect(config);
  let allMatch = true;

  console.log('Сравнение ПРОСТОЙ ВЫГРУЗКИ (сумма amount из operations) за март 2026:');
  console.log('--------------------------------------------------');

  // Выбираем суммы
  const result = await pool.request().query(`
    SELECT
      u.employee_id,
      u.fio,
      ISNULL(SUM(o.amount), 0) AS total_amount
    FROM users u
    LEFT JOIN operations o ON o.user_id = u.id 
      AND o.operation_date >= '2026-03-01' 
      AND o.operation_date < '2026-04-01'
      AND o.wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR', 'FIX_MARCH', 'FIX_MARCH_SIMPLE')
    WHERE u.employee_id IN (${excelData.map(d => `'${d.empId.padStart(8, '0')}'`).join(', ')})
    GROUP BY u.employee_id, u.fio
  `);

  const dbMap = new Map();
  for (const row of result.recordset) {
    dbMap.set(row.employee_id, row.total_amount);
  }

  for (const row of excelData) {
    const paddedEmpId = row.empId.padStart(8, '0');
    const dbValue = Math.round(dbMap.get(paddedEmpId) || 0);
    
    if (dbValue !== row.expected) {
      console.log(`❌ ${row.fio} (${row.empId}): Ожидалось ${row.expected}, в БД ${dbValue} (Разница: ${row.expected - dbValue})`);
      allMatch = false;
    } else {
      console.log(`✅ ${row.fio} (${row.empId}): Совпадает (${dbValue})`);
    }
  }

  console.log('--------------------------------------------------');
  if (allMatch) {
    console.log('🎉 ВСЕ ДАННЫЕ ИДЕАЛЬНО СОВПАДАЮТ!');
  } else {
    console.log('⚠️ ЕСТЬ РАСХОЖДЕНИЯ! Нужно запустить корректирующий скрипт.');
  }

  await pool.close();
}

run().catch(console.error);