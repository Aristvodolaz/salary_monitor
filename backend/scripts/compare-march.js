/**
 * Сравнение сумм за МАРТ 2026: БД vs эталон
 */
const sql  = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server:   process.env.DB_HOST     || 'PRM-SRV-MSSQL-01.komus.net',
  port:     parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME     || 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

const EXPECTED = [
  { fio: 'Абдиали кызы Бегайым', eid: '89780', expected: 5325 },
  { fio: 'Ахунали кызы Дамира', eid: '89916', expected: 69817 },
  { fio: 'Баймуратов Уланбек Талантбекович', eid: '98670', expected: 96738 },
  { fio: 'Байыш кызы Сайкал', eid: '100022', expected: 70704 },
  { fio: 'Богданова Елена Николаевна', eid: '100474', expected: 79579 },
  { fio: 'Брюханова Светлана Владимировна', eid: '90689', expected: 90525 },
  { fio: 'Гуляева Юлия Юрьевна', eid: '99616', expected: 90525 },
  { fio: 'Дмитриев Владимир Андреевич', eid: '70874', expected: 92300 },
  { fio: 'Евстигнеева Любовь Юрьевна', eid: '77099', expected: 142809 },
  { fio: 'Жолдошова Майрамгул Бейшенкуловна', eid: '90888', expected: 31654 },
  { fio: 'Канищева Светлана Николаевна', eid: '85760', expected: 115958 },
  { fio: 'Канчурина Фанзиля Басировна', eid: '84310', expected: 91413 },
  { fio: 'Каримова Ирина Викторовна', eid: '100481', expected: 92596 },
  { fio: 'Козлова Галина Михайловна', eid: '95521', expected: 91413 },
  { fio: 'Кузовкова Ольга Вячеславовна', eid: '80976', expected: 74550 },
  { fio: 'Лайер Александр Александрович', eid: '86803', expected: 43783 },
  { fio: 'Логиновская Екатерина Борисовна', eid: '85916', expected: 61511 },
  { fio: 'Лутошкин Михаил Вячеславович', eid: '11031', expected: 88454 },
  { fio: 'Макарова Елена Николаевна', eid: '74506', expected: 89046 },
  { fio: 'Малинина Вера Сергеевна', eid: '92118', expected: 161078 },
  { fio: 'Мамырбекова Нурзат Мэлсбековна', eid: '96204', expected: 92300 },
  { fio: 'Медерова Каныкей', eid: '100025', expected: 83721 },
  { fio: 'Миллер Ольга Владимировна', eid: '80792', expected: 96080 },
  { fio: 'Мисюля Елена Ивановна', eid: '79442', expected: 90821 },
  { fio: 'Нестеренко Екатерина Николаевна', eid: '92133', expected: 121307 },
  { fio: 'Никотин Сергей Витальевич', eid: '101444', expected: 67154 },
  { fio: 'Ноокенбаева Чолпонай Анарбековна', eid: '91959', expected: 55321 },
  { fio: 'Потапова Татьяна Владимировна', eid: '76947', expected: 42304 },
  { fio: 'Сапрыкина Светлана Зиновьевна', eid: '88619', expected: 89046 },
  { fio: 'Смирнов Александр Андрианович', eid: '100835', expected: 92004 },
  { fio: 'Соколова Светлана Николаевна', eid: '92653', expected: 87863 },
  { fio: 'Стоякин Александр Викторович', eid: '94235', expected: 88750 },
  { fio: 'Суркова Татьяна Дмитриевна', eid: '100116', expected: 56800 },
  { fio: 'Трифонов Николай Евгеньевич', eid: '44591', expected: 87046 },
  { fio: 'Фомина Анастасия Александровна', eid: '100198', expected: 81650 },
  { fio: 'Шакирбаева Айгерим Зарлыковна', eid: '105095', expected: 90229 },
  { fio: 'Шуменко Александр Александрович', eid: '86717', expected: 37779 },
];

async function main() {
  const pool = await sql.connect(dbConfig);

  // Суммы за март по employee_id
  const res = await pool.request().query(`
    SELECT
      u.employee_id,
      u.fio,
      ROUND(SUM(o.amount), 2) AS total_amount,
      COUNT(*) as ops_count
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date < '2026-04-01'
    GROUP BY u.employee_id, u.fio
  `);

  const dbMap = new Map();
  for (const r of res.recordset) {
    const eid = r.employee_id.trim().replace(/^0+/, '');
    dbMap.set(eid, { fio: r.fio, total: parseFloat(r.total_amount), ops: r.ops_count });
  }

  console.log(`${'ФИО'.padEnd(45)} ${'EID'.padStart(8)} ${'Эталон'.padStart(10)} ${'В БД'.padStart(12)} ${'Δ'.padStart(10)} ${'%'.padStart(7)} Ops`);
  console.log('─'.repeat(105));

  let ok = 0, mismatch = 0, missing = 0;
  for (const { fio, eid, expected } of EXPECTED) {
    const db = dbMap.get(eid);
    if (!db) {
      missing++;
      console.log(`${fio.padEnd(45)} ${eid.padStart(8)} ${expected.toString().padStart(10)} ${'НЕТ'.padStart(12)}`);
      continue;
    }
    const delta = Math.round((db.total - expected) * 100) / 100;
    const pct = ((db.total / expected) * 100).toFixed(1);
    const status = Math.abs(delta) < 1 ? 'OK' : '';
    if (Math.abs(delta) < 1) ok++; else mismatch++;
    console.log(
      `${fio.padEnd(45)} ${eid.padStart(8)} ${expected.toString().padStart(10)} ${db.total.toFixed(1).padStart(12)} ${delta.toFixed(1).padStart(10)} ${(pct+'%').padStart(7)} ${db.ops.toString().padStart(5)} ${status}`
    );
  }

  console.log(`\nOK=${ok}, Расхождений=${mismatch}, Нет в БД=${missing}`);

  // Детали для первого расхождения
  if (mismatch > 0) {
    const first = EXPECTED.find(e => {
      const db = dbMap.get(e.eid);
      return db && Math.abs(db.total - e.expected) >= 1;
    });
    if (first) {
      const db = dbMap.get(first.eid);
      console.log(`\n=== ДЕТАЛИ: ${first.fio} (${first.eid}) ===`);
      console.log(`Эталон: ${first.expected}, В БД: ${db.total}`);

      const uid = await pool.request().input('eid', sql.VarChar(50), first.eid)
        .query(`SELECT id FROM users WHERE employee_id = @eid`);
      if (uid.recordset.length > 0) {
        const ops = await pool.request().input('uid', sql.Int, uid.recordset[0].id).query(`
          SELECT operation_type, COUNT(*) as cnt, SUM([count]) as total_aei,
                 ROUND(SUM(amount), 2) as total_amount
          FROM operations
          WHERE user_id = @uid AND operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
          GROUP BY operation_type ORDER BY total_amount DESC
        `);
        for (const o of ops.recordset) {
          console.log(`  ${(o.operation_type||'NULL').padEnd(40)} ops=${o.cnt} aei=${parseFloat(o.total_aei)} sum=${parseFloat(o.total_amount)}`);
        }
      }
    }
  }

  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
