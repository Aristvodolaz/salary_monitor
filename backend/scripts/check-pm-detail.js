const sql = require('mssql');
const cfg = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU', options: { encrypt: false, trustServerCertificate: true } };

async function run() {
  const pool = await sql.connect(cfg);

  // Check salary_summary for the 6 DEF employees
  const ids6 = [566, 560, 570, 558, 598, 596]; // Евстигнеева, Канищева, Логиновская, Малинина, Миллер, Нестеренко
  const r1 = await pool.request().query(`
    SELECT u.fio, u.employee_id, ss.total_amount
    FROM salary_summary ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.period_start = '2026-02-01' AND ss.user_id IN (566,560,570,558,598,596)
  `);
  console.log('=== salary_summary 6 DEF-сотрудников (февраль) ===');
  r1.recordset.forEach(x => console.log(x.fio + '\t' + x.employee_id + '\t' + (x.total_amount||0).toFixed(2)));

  // Reference ПМ_Упаковка for 6 employees
  const refDef = {
    '00077099': { name: 'Евстигнеева',  aei: 13573 },
    '00085760': { name: 'Канищева',     aei: 10417 },
    '00085916': { name: 'Логиновская',  aei: 13483 },
    '00092118': { name: 'Малинина',     aei: 14596 },
    '00080792': { name: 'Миллер',       aei:  2502 },
    '00092133': { name: 'Нестеренко',   aei: 13396 },
  };
  console.log('\n=== Эталон ПМ_Упаковка DEF ===');
  let totalRef = 0;
  for (const [eid, v] of Object.entries(refDef)) {
    const amt = v.aei * 4.3;
    console.log(v.name + '\t' + eid + '\t' + v.aei + ' AEI\t' + amt.toFixed(2) + ' руб');
    totalRef += amt;
  }
  console.log('  Итого: ' + totalRef.toFixed(2));

  // Fetch current Feb ПМ_Упаковка for these 6
  const r2 = await pool.request().query(`
    SELECT u.fio, u.employee_id, SUM(o.count) as cnt, SUM(o.amount) as amt
    FROM operations o JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
      AND o.operation_type = N'ПМ_Упаковка'
      AND o.user_id IN (566,560,570,558,598,596)
    GROUP BY u.fio, u.employee_id
  `);
  console.log('\n=== Текущие ПМ_Упаковка для 6 сотрудников (февраль) ===');
  r2.recordset.forEach(x => console.log(x.fio + '\t' + x.cnt + '\t' + x.amt.toFixed(2)));
  if (r2.recordset.length === 0) console.log('  ПУСТО');

  // Count rows of ПМ_Упаковка under Сотрудник 00000000
  const r3 = await pool.request().query(`
    SELECT COUNT(*) as cnt, SUM(count) as total_aei
    FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND operation_type = N'ПМ_Упаковка'
      AND user_id = 530
  `);
  console.log('\n=== ПМ_Упаковка под Сотрудник 00000000 ===');
  console.log('Строк: ' + r3.recordset[0].cnt + ', total AEI: ' + r3.recordset[0].total_aei);

  // Check what warehouses these ПМ_Упаковка ops come from
  const r4 = await pool.request().query(`
    SELECT o.warehouse_code, COUNT(*) as rows, SUM(o.count) as aei
    FROM operations o
    WHERE o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'
      AND o.operation_type = N'ПМ_Упаковка'
      AND o.user_id = 530
    GROUP BY o.warehouse_code
    ORDER BY SUM(o.count) DESC
  `);
  console.log('\n=== По складам (Сотрудник 00000000, ПМ_Упаковка) ===');
  r4.recordset.forEach(x => console.log('wh=' + x.warehouse_code + '\trows=' + x.rows + '\taei=' + x.aei));

  // Check what participant_area Евстигнеева's ops have
  const r5 = await pool.request().query(`
    SELECT operation_type, participant_area, SUM(count) as cnt, SUM(amount) as amt
    FROM operations
    WHERE operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
      AND user_id = 566
    GROUP BY operation_type, participant_area
    ORDER BY operation_type
  `);
  console.log('\n=== Евстигнеева (id=566) февраль ===');
  let tot5 = 0;
  r5.recordset.forEach(x => { tot5 += x.amt; console.log(x.operation_type + '\t' + (x.participant_area||'NULL') + '\t' + x.cnt + '\t' + x.amt.toFixed(2)); });
  console.log('  Итого: ' + tot5.toFixed(2) + '  (эталон без DEF: ~17188, с DEF: ~75540)');

  await pool.close();
}
run().catch(console.error);
