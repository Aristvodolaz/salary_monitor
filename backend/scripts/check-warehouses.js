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

  const warehouses = await pool.request().query('SELECT id, code, name FROM warehouses');
  
  console.log('\nСклады:');
  warehouses.recordset.forEach(w => {
    console.log(`  ${w.id}. ${w.code} - ${w.name}`);
  });

  // Проверяем, к какому складу относится сотрудник 00000000
  const emp = await pool.request().query(`
    SELECT u.warehouse_id, w.code, w.name
    FROM users u
    INNER JOIN warehouses w ON u.warehouse_id = w.id
    WHERE u.employee_id = '00000000'
  `);

  if (emp.recordset.length > 0) {
    const wh = emp.recordset[0];
    console.log(`\nСотрудник 00000000 относится к складу:`);
    console.log(`  ID: ${wh.warehouse_id}, Код: ${wh.code}, Название: ${wh.name}`);
  }

  await pool.close();
  process.exit(0);
}

main().catch(e => { 
  console.error('❌ Ошибка:', e.message); 
  process.exit(1); 
});
