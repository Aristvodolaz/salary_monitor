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
    // Шаг 1: 9 подтверждённых пропущенных WCR-кодов (Канчурина, февраль 2026)
    const newCodes = [
      ['P2M2', 'М2 Штучная комплектация',  'М2'],
      ['P2M4', 'М4 Штучная комплектация',  'М4'],
      ['P2M5', 'М5 Штучная комплектация',  'М5'],
      ['PS3L', 'М3 Штучная комплектация',  'М3'],
      ['PS3M', 'М3 Штучная комплектация',  'М3'],
      ['PS3S', 'М3 Штучная комплектация',  'М3'],
      ['PKM2', 'М2 Упаковка',              'М2'],
      ['PKM4', 'М4 Упаковка',              'М4'],
      ['PKM5', 'М5 Упаковка',              'М5'],
      ['PS4Z', 'ФС Штучная комплектация',  'ФС'], // Евстигнеева
    ];

    for (const [wcr, opType, area] of newCodes) {
      // Проверяем — вдруг уже есть
      const exists = await new sql.Request(t).input('c', sql.NVarChar, wcr)
        .query('SELECT COUNT(*) as n FROM wcr_mapping WHERE wcr_code=@c');
      if (exists.recordset[0].n > 0) {
        console.log('  SKIP (already exists):', wcr);
        continue;
      }
      await new sql.Request(t)
        .input('c',  sql.NVarChar, wcr)
        .input('op', sql.NVarChar, opType)
        .input('ar', sql.NVarChar, area)
        .input('ds', sql.NVarChar, 'Добавлено 2026-03-19: подтверждено эталонным расчётом февраль-2026')
        .query(`INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
                VALUES (@c, @op, @ar, 1, @ds)`);
      console.log('  ADDED:', wcr, '->', opType);
    }

    // Шаг 2: Исправляем PSST — был ФС Коробочная, должен быть ФС Штучная
    // Доказательство: Евстигнеева, PSST, AEI=2, rate=3, сумма=6 → 2×3=6 ✓ → ФС Штучная (rate=3)
    const upd = await new sql.Request(t)
      .query(`UPDATE wcr_mapping
              SET operation_type='ФС Штучная комплектация',
                  participant_area='ФС',
                  description='ИСПРАВЛЕНО 2026-03-19: было ФС Коробочная (ошибка), должно быть ФС Штучная (AEI×3=6 подтверждено)'
              WHERE wcr_code='PSST'`);
    console.log('  FIXED PSST: rows affected =', upd.rowsAffected[0]);

    // Итог с тарифами
    const check = await new sql.Request(t).query(`
      SELECT wm.wcr_code, wm.operation_type, wm.participant_area, t.rate
      FROM wcr_mapping wm
      LEFT JOIN tariffs t ON t.operation_type=wm.operation_type
        AND t.warehouse_code='ALL' AND t.is_active=1
      WHERE wm.wcr_code IN ('P2M2','P2M4','P2M5','PS3L','PS3M','PS3S','PKM2','PKM4','PKM5','PS4Z','PSST')
      ORDER BY wm.wcr_code
    `);
    console.log('\nНовые/исправленные WCR коды:');
    check.recordset.forEach(r =>
      console.log(`  ${r.wcr_code.padEnd(6)} -> ${r.operation_type.padEnd(35)} | rate = ${r.rate}`)
    );

    const cnt = await new sql.Request(t)
      .query('SELECT COUNT(*) as n FROM wcr_mapping WHERE is_active=1');
    console.log('\nВсего активных WCR-кодов:', cnt.recordset[0].n);

    await t.commit();
    console.log('\n✅ COMMIT — все изменения применены');
  } catch (err) {
    await t.rollback();
    console.error('❌ ROLLBACK:', err.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

run();
