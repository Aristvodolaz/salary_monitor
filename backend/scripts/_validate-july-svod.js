/**
 * Сверка живой БД со «Свод для ЗП» (Выработка комплектация.xlsx).
 * Qty = operations.count (АЕИ), не prod_count. Пароли не печатает.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const sql = require('mssql');

const EXCEL = 'c:\\Users\\G15\\Downloads\\Выработка комплектация.xlsx';
const FINDINGS = path.join(__dirname, '_july-findings.json');
const DEFF_PEOPLE = [
  { pers: '85916', name: 'LOGINOVSKAYA E. B.', qty: 24837 },
  { pers: '85760', name: 'KANISHCHEVA S. N.', qty: 24018 },
  { pers: '77099', name: 'YEVSTIGNEYEVA L.Y.', qty: 23821 },
  { pers: '92118', name: 'MALININA V. S.', qty: 23373 },
  { pers: '80792', name: 'MILLER O. V.', qty: 18943 },
  { pers: '92133', name: 'NESTERENKO E. N.', qty: 9984 },
  { pers: '86717', name: 'SHUMENKO A. A.', qty: 5 },
  { pers: '91959', name: 'NOOKENBAEVA C. A.', qty: 4 },
];

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function stripId(raw) {
  const n = String(raw || '').trim().replace(/^0+/, '');
  return n === '' ? '0' : n;
}

function cellVal(cell) {
  const v = cell && cell.value;
  if (v == null) return null;
  if (typeof v === 'object' && v.result != null) return v.result;
  if (typeof v === 'object' && v.text != null) return v.text;
  return v;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function parseSvod(ws) {
  let headerRow = 1;
  ws.eachRow((row, i) => {
    const a = String(cellVal(row.getCell(1)) || '');
    if (a.includes('Правило') || a.toLowerCase().includes('склад')) headerRow = i;
  });
  const rows = [];
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const wcr = String(cellVal(row.getCell(1)) || '').trim();
    if (!wcr || wcr.length > 12) return;
    const persRaw = String(cellVal(row.getCell(3)) || '').trim();
    if (!persRaw) return;
    rows.push({
      wcr,
      name: String(cellVal(row.getCell(2)) || '').trim(),
      pers: stripId(persRaw),
      qty: Number(cellVal(row.getCell(7)) || 0),
    });
  });
  const byWcr = {};
  const byPers = {};
  const byPersWcr = {};
  for (const r of rows) {
    byWcr[r.wcr] = (byWcr[r.wcr] || 0) + r.qty;
    if (!byPers[r.pers]) byPers[r.pers] = { pers: r.pers, name: r.name, qty: 0 };
    byPers[r.pers].qty += r.qty;
    const k = `${r.pers}|${r.wcr}`;
    byPersWcr[k] = (byPersWcr[k] || 0) + r.qty;
  }
  return {
    rows: rows.length,
    qty: rows.reduce((s, r) => s + r.qty, 0),
    people: Object.keys(byPers).length,
    wcrs: Object.keys(byWcr).sort(),
    byWcr,
    byPers,
    byPersWcr,
  };
}

(async () => {
  const env = loadEnv(path.join(__dirname, '..', '.env'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL);
  const svodWs = wb.getWorksheet('Свод для ЗП');
  if (!svodWs) throw new Error('Sheet «Свод для ЗП» not found');
  const svod = parseSvod(svodWs);
  const excelPeople = Object.keys(svod.byPers);
  const inList = excelPeople.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');

  const pool = await sql.connect({
    server: env.DB_HOST,
    port: parseInt(env.DB_PORT, 10),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 60000,
    requestTimeout: 180000,
  });

  const persExpr = `CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20))`;

  const july02dq = await pool.request().query(`
    SELECT COUNT(*) AS n FROM operations
    WHERE warehouse_code = '02DQ'
      AND operation_date >= '2026-07-01' AND operation_date < '2026-08-01'
  `);

  const bayysh = await pool.request().query(`
    SELECT
      MAX(u.employee_id) AS employee_id,
      MAX(u.fio) AS fio,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0)) AS expected
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE ${persExpr} = '100022'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
  `);

  const totals02 = await pool.request().query(`
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0)) AS expected
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.warehouse_code = '02DQ'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
  `);

  const knownWcrs = svod.wcrs.filter((w) => !['DEFF', 'P3BL', 'P3BM', 'P3BS', 'PHSM'].includes(w));
  const knownIn = knownWcrs.map((w) => `'${w}'`).join(',');
  const knownExcelQty = knownWcrs.reduce((s, w) => s + (svod.byWcr[w] || 0), 0);

  const knownDb = await pool.request().query(`
    SELECT
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0)) AS expected
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.warehouse_code = '02DQ'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
      AND o.wcr_code IN (${knownIn})
  `);

  const p2m2 = await pool.request().query(`
    SELECT
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.warehouse_code = '02DQ'
      AND o.wcr_code = 'P2M2'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
  `);

  const deffDb = await pool.request().query(`
    SELECT
      ${persExpr} AS pers,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.wcr_code = 'DEFF'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY ${persExpr}
  `);
  const deffByPers = new Map(deffDb.recordset.map((r) => [String(r.pers), r]));

  const extraWcrs = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(ISNULL(o.wcr_code,''))) AS wcr,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.warehouse_code = '02DQ'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
      AND o.wcr_code IN ('DEFF','P3BL','P3BM','P3BS','PHSM')
    GROUP BY LTRIM(RTRIM(ISNULL(o.wcr_code,'')))
  `);

  const rpl = await pool.request().query(`
    SELECT
      o.wcr_code,
      MAX(o.operation_type) AS operation_type,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount
    FROM operations o
    WHERE o.wcr_code IN ('RPL1','RPL2','RPL3','RPL5')
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY o.wcr_code
  `);

  const rplMapped = await pool.request().query(`
    SELECT wcr_code, operation_type, is_active
    FROM wcr_mapping
    WHERE wcr_code IN ('RPL1','RPL2','RPL3','RPL5')
  `);

  const viewSample = await pool.request().query(`
    SELECT TOP 30
      o.id,
      o.wcr_code,
      o.count,
      o.prod_count,
      o.amount AS stored_amount,
      sd.base_amount AS view_amount,
      CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0) AS formula_amount
    FROM operations o
    INNER JOIN v_salary_details sd ON sd.operation_id = o.id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND sd.is_picking = 1
    ORDER BY o.count DESC
  `);
  const viewMismatches = viewSample.recordset.filter((r) => {
    const a = round2(r.stored_amount);
    const b = round2(r.view_amount);
    const c = round2(r.formula_amount);
    return Math.abs(a - b) > 0.02 || Math.abs(a - c) > 0.02;
  });

  const wcrCmp = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(ISNULL(o.wcr_code,''))) AS wcr,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.warehouse_code = '02DQ'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
    GROUP BY LTRIM(RTRIM(ISNULL(o.wcr_code,'')))
  `);
  const dbWcr = new Map(wcrCmp.recordset.map((r) => [String(r.wcr).trim(), r]));
  const wcrMismatches = svod.wcrs.map((wcr) => {
    const excel = svod.byWcr[wcr] || 0;
    const db = dbWcr.get(wcr);
    const aei = db ? Number(db.aei || 0) : 0;
    return { wcr, excel, dbAei: aei, delta: aei - excel };
  }).filter((r) => r.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const persCmp = await pool.request().query(`
    SELECT
      ${persExpr} AS pers,
      MAX(u.fio) AS fio,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amount
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.warehouse_code = '02DQ'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
    GROUP BY ${persExpr}
  `);
  const dbPers = new Map(persCmp.recordset.map((r) => [String(r.pers), r]));
  const personMismatches = excelPeople.map((pers) => {
    const excel = svod.byPers[pers].qty;
    const db = dbPers.get(pers);
    const aei = db ? Number(db.aei || 0) : 0;
    return {
      pers,
      name: svod.byPers[pers].name,
      excel,
      dbAei: aei,
      delta: aei - excel,
      exact: aei === excel,
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const deffCheck = DEFF_PEOPLE.map((p) => {
    const db = deffByPers.get(p.pers);
    const aei = db ? Number(db.aei || 0) : 0;
    return { ...p, dbAei: aei, delta: aei - p.qty, pass: aei === p.qty };
  });

  const b = bayysh.recordset[0] || {};
  const t = totals02.recordset[0] || {};
  const k = knownDb.recordset[0] || {};
  const p2 = p2m2.recordset[0] || {};

  const checks = {
    person100022: {
      pass: Number(b.aei) === 141735 && Math.abs(Number(b.amount) - Number(b.expected)) < 0.05,
      excel: 141735,
      dbAei: Number(b.aei || 0),
      dbProd: Number(b.prod || 0),
      dbAmount: round2(b.amount),
      expectedCountXrate: round2(b.expected),
      fio: b.fio,
      employee_id: b.employee_id,
    },
    totals34people02DQ: {
      pass: Math.abs(Number(t.aei || 0) - svod.qty) < 1,
      excel: svod.qty,
      dbAei: Number(t.aei || 0),
      dbAmount: round2(t.amount),
      expected: round2(t.expected),
      delta: Number(t.aei || 0) - svod.qty,
    },
    knownWcrSubset: {
      pass: Math.abs(Number(k.aei || 0) - knownExcelQty) < 50,
      excelKnown: knownExcelQty,
      dbAei: Number(k.aei || 0),
      dbAmount: round2(k.amount),
      expected: round2(k.expected),
      impliedMoneyTarget: 2029474.4,
      deltaAei: Number(k.aei || 0) - knownExcelQty,
    },
    p2m2: {
      pass: Number(p2.aei) === (svod.byWcr.P2M2 || 91843),
      excel: svod.byWcr.P2M2 || 91843,
      dbAei: Number(p2.aei || 0),
      dbProd: Number(p2.prod || 0),
    },
    deff: {
      pass: deffCheck.every((x) => x.pass),
      people: deffCheck,
      dbRows: extraWcrs.recordset.filter((r) => r.wcr === 'DEFF'),
    },
    extraSyncedWcrs: extraWcrs.recordset.map((r) => ({
      wcr: r.wcr,
      n: r.n,
      aei: Number(r.aei || 0),
      amount: round2(r.amount),
      excel: svod.byWcr[r.wcr] || 0,
    })),
    rpl: {
      pass: rpl.recordset.every((r) => Number(r.amount || 0) === 0) && rplMapped.recordset.length === 0,
      rows: rpl.recordset.map((r) => ({
        wcr: r.wcr_code,
        type: r.operation_type,
        n: r.n,
        aei: Number(r.aei || 0),
        amount: round2(r.amount),
      })),
      stillInMapping: rplMapped.recordset,
    },
    viewMatchesStored: {
      pass: viewMismatches.length === 0 && viewSample.recordset.length > 0,
      sampled: viewSample.recordset.length,
      mismatches: viewMismatches.slice(0, 10),
    },
  };

  const exactPeople = personMismatches.filter((p) => p.exact).length;
  const remaining = {
    personMismatches: personMismatches.filter((p) => !p.exact).slice(0, 34),
    wcrMismatches: wcrMismatches.slice(0, 40),
    exactPeople,
    peopleTotal: excelPeople.length,
  };

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')); } catch (_) { /* keep empty */ }

  const validity = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: 'Свод для ЗП',
    formula: 'picking = count × wcr_picking_norms.rate; else mapped count × tariff; else 0',
    warehouse: '02DQ',
    people: 34,
    sapSync: {
      attempted: true,
      warehouse: '02DQ',
      period: '2026-07-01..2026-07-31',
      ok: false,
      error: 'getaddrinfo ENOTFOUND pwm.komus.net',
      deletedBeforeFetch: 57870,
      july02dqRowsNow: Number(july02dq.recordset[0].n || 0),
      note: 'Локальный DNS не резолвит pwm.komus.net. Linux /home/admin-lc/salary_monitor с этой машины недоступен. Нужен повторный sync 02DQ июля с хоста, где SAP открывается.',
      preWipePerson100022: {
        employee_id: '00100022',
        aei: 141735,
        prod: 13443,
        amount: 166084.5,
        expected: 166084.5,
        note: 'Снимок до DELETE, после миграции 017: count×rate совпал с Excel qty.',
      },
    },
    checks,
    remaining,
    allPass: Object.values(checks).every((c) => c.pass === true),
  };

  prev.generatedAt = validity.generatedAt;
  prev.dbConnected = true;
  prev.validity = validity;
  prev.verdict = {
    appWrongFormula: false,
    officialPickingQty: 'AEI (count)',
    currentAppPickingQty: 'count (AEI)',
    formula: validity.formula,
    warehouse: 'Excel — 34 комплектовщика склада 02DQ',
    allPass: validity.allPass,
  };

  fs.writeFileSync(FINDINGS, JSON.stringify(prev, null, 2));
  await pool.close();

  console.log(JSON.stringify({
    allPass: validity.allPass,
    person100022: checks.person100022,
    totals: checks.totals34people02DQ,
    known: checks.knownWcrSubset,
    p2m2: checks.p2m2,
    deffPass: checks.deff.pass,
    extraWcrs: checks.extraSyncedWcrs,
    rpl: checks.rpl,
    view: { pass: checks.viewMatchesStored.pass, sampled: checks.viewMatchesStored.sampled, mismatches: checks.viewMatchesStored.mismatches.length },
    exactPeople,
    topPersonGaps: remaining.personMismatches.slice(0, 8),
    topWcrGaps: remaining.wcrMismatches.slice(0, 8),
  }, null, 2));
})().catch((e) => {
  console.error('VALIDATE FAILED:', e.message);
  process.exit(1);
});
