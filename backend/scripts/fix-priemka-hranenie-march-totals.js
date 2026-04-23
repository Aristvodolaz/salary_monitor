/**
 * Aligns March 2026 warehouse 02DQ "Priemka + hranenie" totals (all wcr_norms amounts)
 * to user reference table (top + bottom sections summed per person).
 * One adjustment row per person: wcr_code FIXPHMAR, sap_order_id FIX_PH_MAR.
 */
const sql = require('mssql');

const DB = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  user: 'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options: { encrypt: false, trustServerCertificate: true },
};

const WCR_FIX = 'FIXPHMAR';
const SAP_FIX = 'FIX_PH_MAR';
const OP_DATE = new Date('2026-03-31T12:00:00');

/** employee_id (8 chars) -> target AEI block sum (priemka + hranenie) */
const TARGET_BY_EMP = new Map([
  ['00075649', 49482],
  ['00078423', 92230],
  ['00078692', 137166 + 3825],
  ['00087615', 43859],
  ['00095682', 2330],
  ['00078796', 90689],
  ['00084660', 131242],
  ['00085765', 115429],
  ['00022732', 101984],
  ['00084779', 124107],
  ['00092115', 75873],
  ['00064694', 46496],
  ['00022178', 73035 + 30600],
  ['00099383', 89975],
  ['00043743', 56753],
  ['00017004', 137394 + 4463],
  ['00033678', 31866 + 40800],
  ['00083177', 103121],
  ['00092963', 84074],
  ['00007101', 83318],
  ['00086717', 3736],
  ['00100835', 858],
  ['00070874', 6251],
]);

async function ensureFixWcr(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'${WCR_FIX}')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (
      N'${WCR_FIX}',
      N'Корректировка итога Приемка+Хранение (март)',
      N'Корректировка',
      NULL,
      1
    );
  `);
}

async function main() {
  const pool = await sql.connect(DB);
  try {
    await ensureFixWcr(pool);

    const empList = [...TARGET_BY_EMP.keys()].map((id) => `'${id}'`).join(', ');

    await pool.request().query(`
      DELETE o FROM operations o
      INNER JOIN users u ON o.user_id = u.id
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      WHERE w.code = '02DQ'
        AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
        AND o.wcr_code = '${WCR_FIX}';

      DELETE no FROM norms_operations no
      INNER JOIN users u ON no.user_id = u.id
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      WHERE w.code = '02DQ'
        AND no.operation_date >= '2026-03-01' AND no.operation_date < '2026-04-01'
        AND no.wcr_code = '${WCR_FIX}';
    `);

    const curRes = await pool.request().query(`
      SELECT
        u.id AS user_id,
        u.employee_id,
        u.fio,
        w.code AS warehouse_code,
        ISNULL(SUM(CASE
          WHEN wn.wcr_code IS NOT NULL AND o.wcr_code NOT LIKE 'FIX%'
          THEN o.amount ELSE 0 END), 0) AS base_total
      FROM users u
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      LEFT JOIN operations o ON o.user_id = u.id
        AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
      LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code AND wn.is_active = 1
      WHERE w.code = '02DQ'
        AND u.employee_id IN (${empList})
      GROUP BY u.id, u.employee_id, u.fio, w.code
    `);

    const seen = new Set();
    let inserted = 0;
    for (const row of curRes.recordset) {
      seen.add(row.employee_id);
      const target = TARGET_BY_EMP.get(row.employee_id);
      if (target === undefined) continue;

      const diff = Math.round((target - row.base_total) * 100) / 100;
      if (Math.abs(diff) < 0.01) {
        console.log(`OK ${row.fio} (${row.employee_id}): already ${target}`);
        continue;
      }

      await pool
        .request()
        .input('userId', sql.Int, row.user_id)
        .input('wh', sql.NVarChar(20), row.warehouse_code)
        .input('opType', sql.NVarChar(100), WCR_FIX)
        .input('cnt', sql.Int, 0)
        .input('opDate', sql.DateTime, OP_DATE)
        .input('amt', sql.Float, diff)
        .input('wcr', sql.NVarChar(50), WCR_FIX)
        .input('sap', sql.NVarChar(100), SAP_FIX)
        .query(`
          INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
          VALUES (@userId, @wh, @opType, @cnt, 0, 0, @opDate, @amt, @sap, @wcr);
          INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
          VALUES (@userId, @wh, @opType, @cnt, 0, 0, @opDate, @amt, @sap, @wcr);
        `);

      inserted++;
      console.log(
        `FIX ${row.fio} (${row.employee_id}): base ${row.base_total.toFixed(2)} -> +${diff.toFixed(2)} = ${target}`,
      );
    }

    for (const empId of TARGET_BY_EMP.keys()) {
      if (!seen.has(empId)) {
        console.warn(`WARN: employee ${empId} not found on warehouse 02DQ`);
      }
    }

    console.log(`\nDone: adjustments inserted: ${inserted}`);
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
