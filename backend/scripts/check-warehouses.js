const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

// Reference values from the client's report
const reference = {
  'ДЕНИСОВ': 4775,
  'ТУПЕЛЕКИН': 3456,
  'МИЩЕНКОВ': 1950,
  'НОВИКОВ': 925,
  'ГОЗИЕВ': 2254,
  'НАДРАЛИЕВ': 1424,
  'ИКСАНОВ': 2278,
  'БЕРДНИКОВ': 893,
  'ДОЛМАТОВ': 521,
  'ЗАХАРОВ': 2645,
  'ТУРСУНОВ': 3267,
  'ТАЖЕНОВ': 2448,
};

async function main() {
  const pool = await sql.connect(cfg);

  // Breakdown by warehouse for key employees
  console.log('\n=== ФС_Коробочная по складам (февраль 2026) ===');
  const r1 = await pool.request().query(
    "SELECT u.fio, o.warehouse_code, SUM(o.count) as total_aei, COUNT(*) as op_count " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND (u.fio LIKE N'%ДЕНИСОВ%' OR u.fio LIKE N'%ТУПЕЛЕКИН%' OR u.fio LIKE N'%МИЩЕНКОВ%' OR u.fio LIKE N'%НОВИКОВ%' OR u.fio LIKE N'%ГОЗИЕВ%' OR u.fio LIKE N'%ИКСАНОВ%' OR u.fio LIKE N'%ЗАХАРОВ%' OR u.fio LIKE N'%ТУРСУНОВ%') " +
    "GROUP BY u.fio, o.warehouse_code " +
    "ORDER BY u.fio, total_aei DESC"
  );
  r1.recordset.forEach(row => {
    const key = Object.keys(reference).find(k => row.fio.includes(k));
    const ref = key ? reference[key] : '?';
    console.log(`  ${row.fio} | wh=${row.warehouse_code} | aei=${row.total_aei} ops=${row.op_count} (ref=${ref})`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
