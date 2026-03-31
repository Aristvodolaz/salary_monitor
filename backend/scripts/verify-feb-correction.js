const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

const CHECKS = [
  { fio: 'ДЕНИСОВ ЮРИЙ ВАСИЛЬЕВИЧ', ref: 4775 },
  { fio: 'МИЩЕНКОВ ДМИТРИЙ ЕВГЕНЬЕВИЧ', ref: 1950 },
  { fio: 'НОВИКОВ АЛЕКСАНДР ВИКТОРОВИЧ', ref: 925 },
  { fio: 'ГОЗИЕВ КУЁШБЕК АБДУРАХИМОВИЧ', ref: 2254 },
  { fio: 'НАДРАЛИЕВ ЕРМЕК БИСИМБАЕВИЧ', ref: 1424 },
  { fio: 'ИКСАНОВ РАФАЭЛЬ НАФИСОВИЧ', ref: 2278 },
  { fio: 'БЕРДНИКОВ АРТЁМ АЛЕКСАНДРОВИЧ', ref: 893 },
  { fio: 'ДОЛМАТОВ ИЛЬЯ АНАТОЛЬЕВИЧ', ref: 521 },
  { fio: 'АБДУМАЛИКОВ ШОМУРОД АБДУМАЛИКОВИЧ', ref: 1379 },
  { fio: 'ФЕДОТОВ РОМАН АЛЕКСАНДРОВИЧ', ref: 70 },
  { fio: 'ХРАПОВ МАКСИМ СЕРГЕЕВИЧ', ref: 78 },
  { fio: 'ШУМЕНКО АЛЕКСАНДР АЛЕКСАНДРОВИЧ', ref: 1139 },
  // Проверяем что правильные сотрудники не изменились
  { fio: 'ТУПЕЛЕКИН ДЕНИС АЛЕКСАНДРОВИЧ', ref: 3456 },
  { fio: 'ТАЖЕНОВ СЕРИК ЗЕЙНУЛЛИЕВИЧ', ref: 2448 },
  { fio: 'ЗАХАРОВ МИХАИЛ МИХАЙЛОВИЧ', ref: 2645, note: 'допускаем ±1' },
  { fio: 'ТУРСУНОВ АКРАМЖОН', ref: 3267 },
  { fio: 'ТРИФОНОВ НИКОЛАЙ ЕВГЕНЬЕВИЧ', ref: 5291 },
  { fio: 'ЛАЙЕР АЛЕКСАНДР АЛЕКСАНДРОВИЧ', ref: 5154 },
  { fio: 'СТОЯКИН АЛЕКСАНДР ВИКТОРОВИЧ', ref: 1967 },
  { fio: 'ДМИТРИЕВ ВЛАДИМИР АНДРЕЕВИЧ', ref: 364 },
  { fio: 'НИКОТИН СЕРГЕЙ ВИТАЛЬЕВИЧ', ref: 468 },
  { fio: 'СМИРНОВ АЛЕКСАНДР АНДРИАНОВИЧ', ref: 162 },
  { fio: 'ЛУТОШКИН МИХАИЛ ВЯЧЕСЛАВОВИЧ', ref: 269 },
  { fio: 'СОПОВ АЛЕКСАНДР ВАСИЛЬЕВИЧ', ref: 747 },
  { fio: 'ПОТАПОВА ТАТЬЯНА ВЛАДИМИРОВНА', ref: 5 },
];

async function main() {
  const pool = await sql.connect(cfg);
  console.log('\n=== Проверка АЕИ ФС_Коробочная за февраль 2026 ===\n');

  let ok = 0, fail = 0;
  for (const { fio, ref, note } of CHECKS) {
    const r = await pool.request().query(
      `SELECT SUM(o.count) as aei FROM operations o JOIN users u ON o.user_id = u.id
       WHERE u.fio LIKE N'%${fio.split(' ')[0]}%' AND u.fio LIKE N'%${fio.split(' ')[1]}%'
         AND o.operation_type = N'ФС_Коробочная комплектация'
         AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'`
    );
    const aei = r.recordset[0]?.aei || 0;
    const diff = aei - ref;
    const status = diff === 0 ? '✅' : (Math.abs(diff) <= 1 ? '🔶' : '❌');
    if (diff === 0) ok++; else fail++;
    const noteStr = note ? ` (${note})` : '';
    console.log(`  ${status} ${fio}: ${aei} | эталон=${ref} | разница=${diff >= 0 ? '+' : ''}${diff}${noteStr}`);
  }
  console.log(`\n  Итого: ${ok} совпадают, ${fail} расхождений`);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
