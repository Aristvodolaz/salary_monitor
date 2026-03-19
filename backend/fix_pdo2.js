const sql = require('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(config);
  const t = new sql.Transaction(pool);
  await t.begin();

  try {
    // Добавляем PDO2 → ДО Коробочная комплектация (rate=7.1 уже есть в tariffs)
    const exists = await new sql.Request(t).input('c', sql.NVarChar, 'PDO2')
      .query('SELECT COUNT(*) as n FROM wcr_mapping WHERE wcr_code=@c');

    if (exists.recordset[0].n > 0) {
      console.log('PDO2 уже существует — обновляем');
      await new sql.Request(t)
        .input('c', sql.NVarChar, 'PDO2')
        .query(`UPDATE wcr_mapping
                SET operation_type='ДО Коробочная комплектация',
                    participant_area='ДО',
                    is_active=1,
                    description='Коробочное комплектование Стеллаж ДО микс. Подтверждено 2026-03-19'
                WHERE wcr_code=@c`);
    } else {
      await new sql.Request(t)
        .input('c',  sql.NVarChar, 'PDO2')
        .input('op', sql.NVarChar, 'ДО Коробочная комплектация')
        .input('ar', sql.NVarChar, 'ДО')
        .input('ds', sql.NVarChar, 'Коробочное комплектование Стеллаж ДО микс. Подтверждено 2026-03-19')
        .query(`INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
                VALUES (@c, @op, @ar, 1, @ds)`);
      console.log('PDO2 ДОБАВЛЕН → ДО Коробочная комплектация (rate=7.1)');
    }

    // Проверка с тарифом
    const check = await new sql.Request(t).query(`
      SELECT wm.wcr_code, wm.operation_type, wm.participant_area, t.rate
      FROM wcr_mapping wm
      LEFT JOIN tariffs t ON t.operation_type=wm.operation_type
        AND t.warehouse_code='ALL' AND t.is_active=1
      WHERE wm.wcr_code='PDO2'
    `);
    console.log('\nРезультат:');
    check.recordset.forEach(r =>
      console.log(`  ${r.wcr_code} → ${r.operation_type} (${r.participant_area}) | rate = ${r.rate}`)
    );

    const cnt = await new sql.Request(t)
      .query('SELECT COUNT(*) as n FROM wcr_mapping WHERE is_active=1');
    console.log('\nВсего активных WCR-кодов:', cnt.recordset[0].n);

    await t.commit();
    console.log('✅ COMMIT');
  } catch (err) {
    await t.rollback();
    console.error('❌ ROLLBACK:', err.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

run();
