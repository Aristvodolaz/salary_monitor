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

  console.log('\n=== Топ-20 сотрудников за март 2026 (по сумме) ===\n');

  const employees = await pool.request().query(`
    SELECT TOP 20
      u.fio,
      u.employee_id,
      COUNT(*) as total_operations,
      SUM(o.count) as total_aei,
      SUM(o.amount) as total_amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <= '2026-03-31'
    GROUP BY u.fio, u.employee_id
    ORDER BY total_amount DESC
  `);

  employees.recordset.forEach((emp, idx) => {
    console.log(`${idx + 1}. ${emp.fio}`);
    console.log(`   ШК: ${emp.employee_id}`);
    console.log(`   Операций: ${emp.total_operations}, АЕИ: ${emp.total_aei}`);
    console.log(`   Сумма: ${emp.total_amount.toFixed(2)} руб.\n`);
  });

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
