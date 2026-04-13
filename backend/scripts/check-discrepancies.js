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
  
  const res = await pool.request().query(`
    SELECT
      u.employee_id,
      ISNULL(SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount ELSE 0 END), 0) +
      ISNULL(SUM(CASE WHEN wp.wcr_code IS NOT NULL AND wp.rate IS NOT NULL
                      THEN ISNULL(o.prod_count, 0) * wp.rate ELSE 0 END), 0) AS total_amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      AND (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)
    GROUP BY u.employee_id
  `);
  
  const map = new Map(res.recordset.map(r => [r.employee_id, r.total_amount]));
  
  for (const exp of excelData) {
    const padId = exp.empId.padStart(8, '0');
    const actual = map.get(padId) || 0;
    if (Math.abs(actual - exp.expected) > 0.01) {
      console.log(`Mismatch for ${exp.fio} (${exp.empId}): Expected ${exp.expected}, Actual ${actual.toFixed(2)}`);
    }
  }
  
  pool.close();
}

run().catch(console.error);