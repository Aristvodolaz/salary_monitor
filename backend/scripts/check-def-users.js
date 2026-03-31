const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

async function run() {
  const pool = await sql.connect(cfg);

  // Find employees who have DEF operations in reference
  // Reference DEF resources: 77099 (Евстигнеева), 85760 (Канищева), 85916 (Логиновская),
  //   92118 (Малинина), 80792 (Миллер), 92133 (Нестеренко)
  const defEmployeeIds = ['77099', '85760', '85916', '92118', '80792', '92133'];

  // Check with and without leading zeros
  const ids = defEmployeeIds.map(id => `'${id}'`).concat(defEmployeeIds.map(id => `'${id.padStart(8, '0')}'`));
  const r1 = await pool.request().query(`
    SELECT id, fio, employee_id FROM users
    WHERE employee_id IN (${ids.join(',')})
    ORDER BY employee_id
  `);
  console.log('=== Поиск по employee_id (DEF сотрудники) ===');
  r1.recordset.forEach(x => console.log('id=' + x.id + '\tfio=' + x.fio + '\temployee_id=' + x.employee_id));

  // Check "Сотрудник 00000000"
  const r2 = await pool.request().query(`
    SELECT id, fio, employee_id FROM users WHERE fio LIKE N'%Сотрудник%' OR employee_id = '00000000'
  `);
  console.log('\n=== Сотрудник 00000000 ===');
  r2.recordset.forEach(x => console.log('id=' + x.id + '\tfio=' + x.fio + '\temployee_id=' + x.employee_id));

  // Check Feb DEF breakdown: who is getting ПМ_Упаковка and how much
  const r3 = await pool.request().query(`
    SELECT u.fio, u.employee_id, SUM(o.count) as cnt, SUM(o.amount) as amt
    FROM operations o JOIN users u ON u.id = o.user_id
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND operation_type = N'ПМ_Упаковка'
    GROUP BY u.fio, u.employee_id
    ORDER BY SUM(o.count) DESC
  `);
  console.log('\n=== ПМ_Упаковка в феврале (ТОП 20) ===');
  r3.recordset.slice(0, 20).forEach(x => console.log(x.fio + '\t' + x.employee_id + '\t' + x.cnt + '\t' + x.amt.toFixed(2)));

  // Check what employee_id the DEF operations are stored under
  const r4 = await pool.request().query(`
    SELECT TOP 5 o.sap_order_id, o.wcr_code, o.count, o.operation_date
    FROM operations o JOIN users u ON u.id = o.user_id
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND operation_type = N'ПМ_Упаковка'
      AND u.fio LIKE N'%Сотрудник%'
  `);
  console.log('\n=== Пример DEF строк под Сотрудник 00000000 ===');
  r4.recordset.forEach(x => console.log('sap_order=' + (x.sap_order_id||'NULL') + '\twcr=' + (x.wcr_code||'NULL') + '\tcnt=' + x.count + '\tdate=' + x.operation_date.toISOString().slice(0,10)));

  await pool.close();
}
run().catch(console.error);
