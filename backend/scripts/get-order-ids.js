const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };
async function main() {
  const pool = await sql.connect(cfg);
  const r = await pool.request().query(
    "SELECT TOP 10 o.sap_order_id, o.count, o.actdura, o.operation_date " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_type = N'" + "ФС_Коробочная комплектация" + "' " +
    "AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND u.fio LIKE N'%" + "ДЕНИСОВ" + "%' " +
    "ORDER BY o.operation_date"
  );
  r.recordset.forEach(row => console.log(row.sap_order_id + '|' + row.count + '|' + row.actdura + '|' + (row.operation_date||'').toString().slice(0,10)));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
