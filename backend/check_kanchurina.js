const sql = require('mssql');

const config = {
  server: 'localhost',
  user: 'sa',
  password: 'Komus2025!',
  database: 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function main() {
  const pool = await sql.connect(config);
  
  // 1. Проверяем user_id=565
  const user = await pool.request().query(`
    SELECT id, employee_id, full_name, warehouse_id 
    FROM users WHERE id = 565
  `);
  console.log('\n=== USER INFO ===');
  console.log(user.recordset[0]);
  
  // 2. Все операции за февраль
  const ops = await pool.request().query(`
    SELECT 
      operation_date,
      operation_type,
      count,
      amount,
      sap_order_id
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'
    ORDER BY operation_date, operation_type
  `);
  
  console.log('\n=== OPERATIONS (Feb 2026) ===');
  console.log(`Total operations: ${ops.recordset.length}`);
  ops.recordset.forEach(op => {
    console.log(`${op.operation_date.toISOString().slice(0,10)} | ${op.operation_type} | count=${op.count} | amount=${op.amount.toFixed(2)} | order=${op.sap_order_id}`);
  });
  
  // 3. Итоговая сумма
  const total = await pool.request().query(`
    SELECT SUM(amount) as total_salary
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'
  `);
  
  console.log('\n=== TOTAL SALARY ===');
  console.log(`Total: ${total.recordset[0].total_salary?.toFixed(2) || 0} руб.`);
  console.log(`Expected: 37 812 руб.`);
  console.log(`Difference: ${(37812 - (total.recordset[0].total_salary || 0)).toFixed(2)} руб.`);
  
  await pool.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
