/**
 * Анализ февральских операций для выявления "лишних" RPL1
 */
const sql = require('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  user: 'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options: { trustServerCertificate: true, encrypt: false }
};

async function main() {
  const pool = await sql.connect(cfg);

  // 1. Типы операций Денисова за февраль
  console.log('\n=== Операции Денисова за февраль 2026 ===');
  const r1 = await pool.request().query(
    "SELECT u.fio, o.operation_type, SUM(o.count) as total_aei, COUNT(*) as op_count " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND u.fio LIKE N'%ДЕНИСОВ%' " +
    "GROUP BY u.fio, o.operation_type " +
    "ORDER BY u.fio, total_aei DESC"
  );
  r1.recordset.forEach(row => {
    console.log(`  ${row.fio} | ${row.operation_type} | aei=${row.total_aei} ops=${row.op_count}`);
  });

  // 2. Типы операций Тупелекина за февраль
  console.log('\n=== Операции Тупелекина за февраль 2026 ===');
  const r2 = await pool.request().query(
    "SELECT u.fio, o.operation_type, SUM(o.count) as total_aei, COUNT(*) as op_count " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND u.fio LIKE N'%ТУПЕЛЕКИН%' " +
    "GROUP BY u.fio, o.operation_type " +
    "ORDER BY u.fio, total_aei DESC"
  );
  r2.recordset.forEach(row => {
    console.log(`  ${row.fio} | ${row.operation_type} | aei=${row.total_aei} ops=${row.op_count}`);
  });

  // 3. Все сотрудники с ФС_Коробочная за февраль
  console.log('\n=== Все сотрудники с ФС_Коробочная за февраль 2026 ===');
  const r3 = await pool.request().query(
    "SELECT u.fio, SUM(o.count) as total_aei, COUNT(*) as op_count " +
    "FROM operations o JOIN users u ON o.user_id = u.id " +
    "WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01' " +
    "AND o.operation_type = N'ФС_Коробочная комплектация' " +
    "GROUP BY u.fio " +
    "ORDER BY total_aei DESC"
  );
  r3.recordset.forEach(row => {
    console.log(`  ${row.fio} | aei=${row.total_aei} ops=${row.op_count}`);
  });

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
