const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

// Reference values from the client's report
const reference = {
  'ДЕНИСОВ': 4775,
  'МИЩЕНКОВ': 1950,
  'НОВИКОВ': 925,
  'ГОЗИЕВ': 2254,
  'НАДРАЛИЕВ': 1424,
  'ИКСАНОВ': 2278,
  'БЕРДНИКОВ': 893,
  'ДОЛМАТОВ': 521,
  'АБДУМАЛИКОВ': 1379,
  'ФЕДОТОВ': 70,
  'ХРАПОВ': 78,
  'ШУМЕНКО': 1139,  // UNDER-count: actual=1129, ref=1139
};

async function main() {
  const pool = await sql.connect(cfg);

  // Split by Feb 2-6 vs Feb 9+
  console.log('\n=== AEI по периодам для ключевых сотрудников ===');
  const r1 = await pool.request().query(
    "SELECT u.fio, " +
    "SUM(CASE WHEN o.operation_date < '2026-02-09' THEN o.count ELSE 0 END) as feb02_06, " +
    "SUM(CASE WHEN o.operation_date >= '2026-02-09' THEN o.count ELSE 0 END) as feb09_end, " +
    "SUM(o.count) as total " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND (u.fio LIKE N'%ДЕНИСОВ%' OR u.fio LIKE N'%МИЩЕНКОВ%' OR u.fio LIKE N'%НОВИКОВ%' OR " +
    "u.fio LIKE N'%ГОЗИЕВ%' OR u.fio LIKE N'%НАДРАЛИЕВ%' OR u.fio LIKE N'%ИКСАНОВ%' OR " +
    "u.fio LIKE N'%БЕРДНИКОВ%' OR u.fio LIKE N'%ДОЛМАТОВ%' OR u.fio LIKE N'%ТУПЕЛЕКИН%' OR " +
    "u.fio LIKE N'%ЗАХАРОВ%' OR u.fio LIKE N'%ТУРСУНОВ%' OR u.fio LIKE N'%ТАЖЕНОВ%') " +
    "GROUP BY u.fio ORDER BY total DESC"
  );
  r1.recordset.forEach(row => {
    const key = Object.keys(reference).find(k => row.fio.includes(k));
    const ref = key ? reference[key] : '—';
    const excess = ref !== '—' ? row.total - ref : '?';
    const excessFeb = row.feb02_06;
    const diff = ref !== '—' ? row.total - ref - row.feb02_06 : '?';
    console.log(`  ${row.fio}: total=${row.total} | ref=${ref} | excess=${excess} | feb02-06=${excessFeb} | remaining_excess_after_excl=${diff}`);
  });

  // Check if Тупелекин specifically was on vacation Feb 2-6
  console.log('\n=== Когда начались операции у "правильных" сотрудников ===');
  const r2 = await pool.request().query(
    "SELECT u.fio, " +
    "MIN(FORMAT(o.operation_date,'yyyy-MM-dd')) as first_date, " +
    "COUNT(*) as ops, SUM(o.count) as aei " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND (u.fio LIKE N'%ТУПЕЛЕКИН%' OR u.fio LIKE N'%ЗАХАРОВ%' OR u.fio LIKE N'%ТУРСУНОВ%' OR u.fio LIKE N'%ТАЖЕНОВ%' OR u.fio LIKE N'%ТРИФОНОВ%' OR u.fio LIKE N'%СТОЯКИН%' OR u.fio LIKE N'%ЛАЙЕР%') " +
    "GROUP BY u.fio ORDER BY first_date"
  );
  r2.recordset.forEach(row => console.log(`  ${row.fio}: first=${row.first_date} ops=${row.ops} aei=${row.aei}`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
