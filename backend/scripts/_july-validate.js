/**
 * Post-017 validation: July 2026 picking vs Excel «Свод для ЗП».
 * Qty = operations.count (AEI). Warehouse 02DQ. Writes _july-validate.json.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const sql = require('mssql');

const EXCEL = 'c:\\Users\\G15\\Downloads\\Выработка комплектация.xlsx';
const OUT = path.join(__dirname, '_july-validate.json');
const NEW_WCRS = ['DEFF', 'P3BL', 'P3BM', 'P3BS', 'PHSM'];
const RPL_WCRS = ['RPL1', 'RPL2', 'RPL3', 'RPL5'];
const MISSING_FAMILY = ['DEFF', 'P3BL', 'P3BM', 'P3BS', 'PHSM'];

function stripId(raw) {
  const s = String(raw || '').trim();
  const n = s.replace(/^0+/, '');
  return n === '' ? '0' : n;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function cellVal(cell) {
  const v = cell && cell.value;
  if (v == null) return null;
  if (typeof v === 'object' && v.result != null) return v.result;
  if (typeof v === 'object' && v.text != null) return v.text;
  return v;
}

function loadEnvPassword() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = env.match(/^DB_PASSWORD=(.*)$/m);
  return m ? m[1].trim() : '';
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
    const qty = Number(cellVal(row.getCell(7)) || 0);
    rows.push({
      wcr,
      name: String(cellVal(row.getCell(2)) || '').trim(),
      pers: stripId(persRaw),
      persRaw,
      fio: [cellVal(row.getCell(4)), cellVal(row.getCell(5))]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' '),
      qty,
    });
  });
  const byWcr = {};
  const byPers = {};
  const byPersWcr = {};
  for (const r of rows) {
    byWcr[r.wcr] = (byWcr[r.wcr] || 0) + r.qty;
    if (!byPers[r.pers]) byPers[r.pers] = { pers: r.pers, name: r.name, fio: r.fio, qty: 0 };
    byPers[r.pers].qty += r.qty;
    const k = r.pers + '|' + r.wcr;
    byPersWcr[k] = (byPersWcr[k] || 0) + r.qty;
  }
  return { rows, byWcr, byPers, byPersWcr, qty: rows.reduce((s, r) => s + r.qty, 0) };
}

async function connectDb() {
  const password = loadEnvPassword();
  const cfg = {
    server: 'PRM-SRV-MSSQL-01.komus.net',
    port: 59587,
    database: 'SalaryMonitor',
    user: 'sa',
    password,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 60000,
    requestTimeout: 180000,
  };
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      console.log('DB connect attempt', i);
      return await sql.connect(cfg);
    } catch (e) {
      lastErr = e;
      console.error('DB connect failed', i, e.code || e.message);
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw lastErr;
}

async function q(pool, text) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      return await pool.request().query(text);
    } catch (e) {
      lastErr = e;
      const timeout = /timeout|ETIMEOUT|ETIME/i.test(String(e.code || e.message));
      console.error('query attempt', i, e.code || e.message);
      if (!timeout || i === 3) throw e;
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw lastErr;
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL);
  const ws = wb.worksheets.find((s) => s.name === 'Свод для ЗП');
  if (!ws) throw new Error('Sheet «Свод для ЗП» not found');
  const svod = parseSvod(ws);
  const persList = Object.keys(svod.byPers).sort((a, b) => Number(a) - Number(b));
  const inList = persList.map((p) => `'${p}'`).join(',');
  const persExpr = `CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20))`;

  console.log('EXCEL people', persList.length, 'qty', svod.qty);
  const pool = await connectDb();
  console.log('DB_OK');

  const norms = await q(pool, `
    SELECT wcr_code, participant_area, picking_type, norm_label, rate, is_active
    FROM wcr_picking_norms
  `);
  const normBy = new Map(norms.recordset.map((r) => [String(r.wcr_code).trim(), r]));

  const mappingNew = await q(pool, `
    SELECT wcr_code, operation_type, participant_area, is_active
    FROM wcr_mapping
    WHERE wcr_code IN ('DEFF','P3BL','P3BM','P3BS','PHSM','RPL1','RPL2','RPL3','RPL5','DEF')
    ORDER BY wcr_code
  `);

  const pickingNormsNew = await q(pool, `
    SELECT wcr_code, participant_area, picking_type, norm_label, rate, is_active
    FROM wcr_picking_norms
    WHERE wcr_code IN ('DEFF','P3BL','P3BM','P3BS','PHSM','DEF')
    ORDER BY wcr_code
  `);

  const rplOps = await q(pool, `
    SELECT
      LTRIM(RTRIM(o.wcr_code)) AS wcr_code,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      MAX(o.operation_type) AS operation_type,
      MAX(o.participant_area) AS participant_area
    FROM operations o
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.wcr_code IN ('RPL1','RPL2','RPL3','RPL5')
    GROUP BY LTRIM(RTRIM(o.wcr_code))
  `);

  const newWcrOps = await q(pool, `
    SELECT
      LTRIM(RTRIM(o.wcr_code)) AS wcr_code,
      o.warehouse_code,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.wcr_code IN ('DEFF','P3BL','P3BM','P3BS','PHSM')
    GROUP BY LTRIM(RTRIM(o.wcr_code)), o.warehouse_code
  `);

  const bayysh = await q(pool, `
    SELECT
      u.employee_id, u.fio,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} = '100022'
    GROUP BY u.employee_id, u.fio
  `);

  const bayysh02dq = await q(pool, `
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND ${persExpr} = '100022'
  `);

  const bayyshByWcr = await q(pool, `
    SELECT LTRIM(RTRIM(o.wcr_code)) AS wcr_code,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      MAX(wp.rate) AS rate
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND ${persExpr} = '100022'
    GROUP BY LTRIM(RTRIM(o.wcr_code))
    ORDER BY SUM(CAST(ISNULL(o.count,0) AS FLOAT)) DESC
  `);

  const peopleDb = await q(pool, `
    SELECT
      ${persExpr} AS pers,
      MAX(u.employee_id) AS employee_id,
      MAX(u.fio) AS fio,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND ${persExpr} IN (${inList})
    GROUP BY ${persExpr}
  `);

  const peopleWcrDb = await q(pool, `
    SELECT
      ${persExpr} AS pers,
      LTRIM(RTRIM(o.wcr_code)) AS wcr_code,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND ${persExpr} IN (${inList})
    GROUP BY ${persExpr}, LTRIM(RTRIM(o.wcr_code))
  `);

  const tot34 = await q(pool, `
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND ${persExpr} IN (${inList})
  `);

  const tot02dq = await q(pool, `
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
  `);

  const viewDef = await q(pool, `
    SELECT OBJECT_DEFINITION(OBJECT_ID('v_salary_details')) AS def
  `);

  const viewSpot = await q(pool, `
    SELECT TOP 8
      o.id,
      o.wcr_code,
      o.count,
      o.prod_count,
      o.amount AS op_amount,
      v.base_amount AS view_base,
      wp.rate,
      CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0) AS count_x_rate,
      CAST(ISNULL(o.prod_count,0) AS FLOAT) * ISNULL(wp.rate,0) AS prod_x_rate
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    INNER JOIN v_salary_details v ON v.operation_id = o.id
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND o.amount <> 0
    ORDER BY o.amount DESC
  `);

  const viewMismatch = await q(pool, `
    SELECT COUNT(*) AS n
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    INNER JOIN v_salary_details v ON v.operation_id = o.id
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND ABS(ISNULL(o.amount,0) - ISNULL(v.base_amount,0)) > 0.02
  `);

  const formulaCheck = await q(pool, `
    SELECT
      SUM(CASE WHEN ABS(o.amount - CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0)) <= 0.02 THEN 1 ELSE 0 END) AS match_count,
      SUM(CASE WHEN ABS(o.amount - CAST(ISNULL(o.prod_count,0) AS FLOAT) * ISNULL(wp.rate,0)) <= 0.02 THEN 1 ELSE 0 END) AS match_prod,
      COUNT(*) AS n
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
  `);

  await pool.close();

  const dbPers = new Map(peopleDb.recordset.map((r) => [stripId(r.pers), r]));
  const dbPersWcr = {};
  for (const r of peopleWcrDb.recordset) {
    const pers = stripId(r.pers);
    if (!dbPersWcr[pers]) dbPersWcr[pers] = {};
    dbPersWcr[pers][String(r.wcr_code).trim()] = Number(r.aei || 0);
  }

  function excelFamilyQty(pers, codes) {
    let s = 0;
    for (const w of codes) s += svod.byPersWcr[pers + '|' + w] || 0;
    return s;
  }

  const people = persList.map((pers) => {
    const e = svod.byPers[pers];
    const d = dbPers.get(pers);
    const excelQty = e.qty;
    const dbAei = d ? Number(d.aei || 0) : 0;
    const dbAmt = d ? round2(d.amt) : 0;
    const deff = excelFamilyQty(pers, ['DEFF']);
    const p3b = excelFamilyQty(pers, ['P3BL', 'P3BM', 'P3BS', 'PHSM']);
    const missingFamily = excelFamilyQty(pers, MISSING_FAMILY);
    const delta = round2(dbAei - excelQty);
    const afterDeff = round2(dbAei - (excelQty - deff));
    const afterFamily = round2(dbAei - (excelQty - missingFamily));
    let classif = 'other_delta';
    if (Math.abs(delta) < 0.5) classif = 'exact';
    else if (deff > 0 && Math.abs(afterDeff) < 0.5 && p3b < 0.5) classif = 'deff_only_gap';
    else if (missingFamily > 0 && Math.abs(afterFamily) < 0.5) classif = 'missing_wcr_family_gap';
    else if (missingFamily > 0 && Math.abs(delta + missingFamily) < Math.abs(delta)) classif = 'partial_missing_wcr';
    let impliedExcelAmt = 0;
    for (const [k, qty] of Object.entries(svod.byPersWcr)) {
      if (!k.startsWith(pers + '|')) continue;
      const wcr = k.slice(pers.length + 1);
      const n = normBy.get(wcr);
      if (n && n.rate != null) impliedExcelAmt += qty * Number(n.rate);
    }
    return {
      pers,
      employee_id: d ? d.employee_id : null,
      excelName: e.name,
      dbFio: d ? d.fio : '',
      excelQty,
      dbAei,
      dbAmt,
      impliedExcelAmt: round2(impliedExcelAmt),
      delta,
      excelDeff: deff,
      excelP3bPhsm: p3b,
      classif,
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  let excelImpliedAmt = 0;
  let excelQtyInNorms = 0;
  let excelQtyUnknown = 0;
  const unknownWcrs = {};
  for (const [wcr, qty] of Object.entries(svod.byWcr)) {
    const n = normBy.get(wcr);
    if (n && n.rate != null) {
      excelQtyInNorms += qty;
      excelImpliedAmt += qty * Number(n.rate);
    } else {
      excelQtyUnknown += qty;
      unknownWcrs[wcr] = qty;
    }
  }

  const bay = bayysh.recordset[0] || {};
  const bay02 = bayysh02dq.recordset[0] || {};
  const bayExcel = svod.byPers['100022'] || { qty: 0, name: '' };
  let bayImplied = 0;
  for (const [k, qty] of Object.entries(svod.byPersWcr)) {
    if (!k.startsWith('100022|')) continue;
    const wcr = k.slice('100022|'.length);
    const n = normBy.get(wcr);
    if (n && n.rate != null) bayImplied += qty * Number(n.rate);
  }

  const viewText = String(viewDef.recordset[0]?.def || '');
  const viewUsesCount =
    /THEN CAST\(ISNULL\(o\.count, 0\) AS FLOAT\) \* ISNULL\(wp\.rate, 0\)/i.test(viewText) ||
    /THEN CAST\(ISNULL\(o\.count, 0\) AS FLOAT\) \* ISNULL\(wp\.rate/i.test(viewText);
  const viewUsesProdForPicking = /wp[\s\S]{0,200}prod_count/i.test(viewText);

  const mappingCodes = new Set(mappingNew.recordset.map((r) => String(r.wcr_code).trim()));
  const pickingCodes = new Set(pickingNormsNew.recordset.map((r) => String(r.wcr_code).trim()));
  const rplInMapping = RPL_WCRS.filter((w) => mappingCodes.has(w));
  const rplAmt = rplOps.recordset.map((r) => ({
    wcr: r.wcr_code,
    n: Number(r.n || 0),
    aei: Number(r.aei || 0),
    amt: round2(r.amt),
    operation_type: r.operation_type,
  }));
  const rplAmtAllZero = rplAmt.every((r) => Math.abs(r.amt) < 0.01);

  const newWcrJuly = {};
  for (const w of NEW_WCRS) newWcrJuly[w] = { n: 0, aei: 0, amt: 0, warehouses: [] };
  for (const r of newWcrOps.recordset) {
    const w = String(r.wcr_code).trim();
    if (!newWcrJuly[w]) newWcrJuly[w] = { n: 0, aei: 0, amt: 0, warehouses: [] };
    newWcrJuly[w].n += Number(r.n || 0);
    newWcrJuly[w].aei += Number(r.aei || 0);
    newWcrJuly[w].amt += Number(r.amt || 0);
    newWcrJuly[w].warehouses.push({
      warehouse: r.warehouse_code,
      n: Number(r.n || 0),
      aei: Number(r.aei || 0),
    });
  }
  for (const w of NEW_WCRS) newWcrJuly[w].amt = round2(newWcrJuly[w].amt);

  const tot = tot34.recordset[0] || {};
  const dbAei34 = Number(tot.aei || 0);
  const dbAmt34 = round2(tot.amt);
  const excelDeffTotal = svod.byWcr.DEFF || 0;
  const excelFamilyTotal = MISSING_FAMILY.reduce((s, w) => s + (svod.byWcr[w] || 0), 0);

  const person100022 = {
    excelQty: bayExcel.qty,
    excelName: bayExcel.name,
    expectedQty: 141735,
    expectedAmt: 166084.5,
    employee_id: bay.employee_id || null,
    fio: bay.fio || '',
    dbAeiAllWh: Number(bay.aei || 0),
    dbProdAllWh: Number(bay.prod || 0),
    dbAmtAllWh: round2(bay.amt),
    dbAei02dq: Number(bay02.aei || 0),
    dbAmt02dq: round2(bay02.amt),
    impliedExcelAmt: round2(bayImplied),
    qtyPass: Math.abs(Number(bay02.aei || 0) - 141735) < 0.5,
    amtPass: Math.abs(round2(bay02.amt) - 166084.5) < 0.05,
    byWcr: bayyshByWcr.recordset.map((r) => ({
      wcr: r.wcr_code,
      aei: Number(r.aei || 0),
      amt: round2(r.amt),
      rate: r.rate != null ? Number(r.rate) : null,
    })),
  };

  const exact = people.filter((p) => p.classif === 'exact');
  const deffOnly = people.filter((p) => p.classif === 'deff_only_gap');
  const familyGap = people.filter((p) => p.classif === 'missing_wcr_family_gap');
  const other = people.filter((p) => !['exact', 'deff_only_gap', 'missing_wcr_family_gap'].includes(p.classif));

  const dictPass =
    NEW_WCRS.every((w) => mappingCodes.has(w) && pickingCodes.has(w)) &&
    rplInMapping.length === 0 &&
    rplAmtAllZero;

  const formula = formulaCheck.recordset[0] || {};
  const formulaPass =
    Number(formula.match_count || 0) === Number(formula.n || 0) && Number(formula.n || 0) > 0;
  const viewPass = viewUsesCount && !viewUsesProdForPicking;
  const viewSpotPass = Number(viewMismatch.recordset[0]?.n || 0) === 0;

  const qtyGapVsExcel = round2(dbAei34 - svod.qty);
  const qtyGapAfterFamily = round2(dbAei34 - (svod.qty - excelFamilyTotal));

  const checks = {
    person100022: person100022.qtyPass && person100022.amtPass ? 'PASS' : (person100022.qtyPass ? 'FAIL_AMOUNT' : 'FAIL'),
    people34: other.length === 0 ? 'PASS_OR_EXPECTED_GAPS' : 'FAIL_OTHER_DELTAS',
    totals: Math.abs(qtyGapAfterFamily) < 50 ? 'PASS_AFTER_MISSING_WCR' : 'FAIL',
    rpl: dictPass && rplAmtAllZero && rplInMapping.length === 0 ? 'PASS' : 'FAIL',
    newWcrsInDict: NEW_WCRS.every((w) => mappingCodes.has(w) && pickingCodes.has(w)) ? 'PASS' : 'FAIL',
    newWcrsJulyOps: NEW_WCRS.every((w) => (newWcrJuly[w].n || 0) === 0) ? 'MISSING_UNTIL_RESYNC' : 'PRESENT',
    viewVsOps: viewSpotPass && viewPass ? 'PASS' : 'FAIL',
    formulaCountNotProd: formulaPass ? 'PASS' : 'FAIL',
  };

  const overall =
    person100022.qtyPass &&
    dictPass &&
    viewPass &&
    viewSpotPass &&
    formulaPass &&
    other.length === 0
      ? (NEW_WCRS.every((w) => (newWcrJuly[w].n || 0) === 0) ? 'CONDITIONAL_PASS' : 'PASS')
      : 'FAIL';

  const result = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: 'Свод для ЗП',
    warehouse: '02DQ',
    period: '2026-07',
    qtyField: 'operations.count (AEI), not prod_count',
    overall,
    checks,
    person100022,
    people34: {
      excelPeople: persList.length,
      excelQty: svod.qty,
      dbAei: dbAei34,
      dbAmt: dbAmt34,
      dbN: Number(tot.n || 0),
      dbProd: Number(tot.prod || 0),
      exactMatches: exact.length,
      deffOnlyGaps: deffOnly.length,
      missingWcrFamilyGaps: familyGap.length,
      otherDeltas: other.length,
      exact: exact.map((p) => ({ pers: p.pers, name: p.excelName, qty: p.excelQty, amt: p.dbAmt })),
      deffOnly: deffOnly.map((p) => ({
        pers: p.pers,
        name: p.excelName,
        excelQty: p.excelQty,
        dbAei: p.dbAei,
        delta: p.delta,
        excelDeff: p.excelDeff,
      })),
      missingWcrFamily: familyGap.map((p) => ({
        pers: p.pers,
        name: p.excelName,
        excelQty: p.excelQty,
        dbAei: p.dbAei,
        delta: p.delta,
        excelDeff: p.excelDeff,
        excelP3bPhsm: p.excelP3bPhsm,
      })),
      other: other.map((p) => ({
        pers: p.pers,
        name: p.excelName,
        excelQty: p.excelQty,
        dbAei: p.dbAei,
        delta: p.delta,
        excelDeff: p.excelDeff,
        excelP3bPhsm: p.excelP3bPhsm,
        classif: p.classif,
      })),
    },
    totals: {
      excelSvodQty: svod.qty,
      excelQtyInNorms: excelQtyInNorms,
      excelQtyUnknown: excelQtyUnknown,
      unknownWcrs,
      excelImpliedAmt: round2(excelImpliedAmt),
      dbAei34_02dq: dbAei34,
      dbAmt34_02dq: dbAmt34,
      dbAeiAll02dqPicking: Number(tot02dq.recordset[0]?.aei || 0),
      dbAmtAll02dqPicking: round2(tot02dq.recordset[0]?.amt),
      deltaAeiVsSvod: qtyGapVsExcel,
      excelMissingFamilyQty: excelFamilyTotal,
      excelDeffQty: excelDeffTotal,
      deltaAfterMissingFamily: qtyGapAfterFamily,
    },
    rpl: {
      inWcrMapping: rplInMapping,
      july: rplAmt,
      amountAllZero: rplAmtAllZero,
      notInMapping: rplInMapping.length === 0,
    },
    dictionaries: {
      mapping: mappingNew.recordset,
      pickingNorms: pickingNormsNew.recordset.map((r) => ({
        wcr_code: r.wcr_code,
        norm_label: r.norm_label,
        rate: Number(r.rate),
        is_active: r.is_active,
      })),
      deffP3bPhsmInMapping: NEW_WCRS.every((w) => mappingCodes.has(w)),
      deffP3bPhsmInPickingNorms: NEW_WCRS.every((w) => pickingCodes.has(w)),
    },
    newWcrJulyOps: newWcrJuly,
    view: {
      usesCountTimesPickingRate: viewUsesCount,
      usesProdCountForPicking: viewUsesProdForPicking,
      julyPickingMismatchesVsOps: Number(viewMismatch.recordset[0]?.n || 0),
      spotCheck: viewSpot.recordset.map((r) => ({
        id: r.id,
        wcr: r.wcr_code,
        count: Number(r.count),
        prod_count: Number(r.prod_count),
        op_amount: round2(r.op_amount),
        view_base: round2(r.view_base),
        count_x_rate: round2(r.count_x_rate),
        prod_x_rate: round2(r.prod_x_rate),
        match: Math.abs(Number(r.op_amount) - Number(r.view_base)) <= 0.02,
      })),
    },
    formulaCheck: {
      july02dqPickingRows: Number(formula.n || 0),
      amountEqualsCountXrate: Number(formula.match_count || 0),
      amountEqualsProdXrate: Number(formula.match_prod || 0),
    },
    resync: {
      ran: false,
      reason: 'July 02DQ full SAP reload deletes the period then re-inserts 31 daily chunks; not safe/fast from this session. DEFF/P3B*/PHSM ops are missing until re-sync after deploy.',
      afterDeploy: {
        preferred: 'POST /api/sap/sync-period {"start":"2026-07-01","end":"2026-07-31"} — после git pull + tsc + pm2. Удаляет и перезаливает ВСЕ склады за июль, не только 02DQ; может занять десятки минут.',
        normsOnly: 'POST /api/norms/sync {"startDate":"2026-07-01","endDate":"2026-07-31"} — syncNormsOnly, тоже DELETE норм-операций по всем складам, затем SAP 31 день. Не запускать пока код 017 не задеплоен.',
        note: 'syncWarehouseManual(02DQ) есть в сервисе, но HTTP-эндпоинта нет. Не запускать локально: DELETE периода + SAP OData + риск оборвать загрузку.',
      },
    },
    productionReady: {
      formulaAndDicts: dictPass && formulaPass && viewPass,
      julyDataComplete: NEW_WCRS.every((w) => (newWcrJuly[w].n || 0) > 0) && other.length === 0 && person100022.amtPass,
      note: 'Формула и справочники готовы. Июльские строки DEFF/P3B*/PHSM появятся только после re-sync SAP.',
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  console.log('WROTE', OUT);
  console.log(JSON.stringify({
    overall: result.overall,
    checks: result.checks,
    person100022: {
      qty: person100022.dbAei02dq,
      amt: person100022.dbAmt02dq,
      qtyPass: person100022.qtyPass,
      amtPass: person100022.amtPass,
    },
    people: {
      exact: exact.length,
      deffOnly: deffOnly.length,
      family: familyGap.length,
      other: other.length,
    },
    totals: result.totals,
    rpl: result.rpl,
    newWcrJulyOps: result.newWcrJulyOps,
    viewMismatches: result.view.julyPickingMismatchesVsOps,
    formulaCheck: result.formulaCheck,
  }, null, 2));
})().catch((e) => {
  console.error('FATAL', e.code || e.message);
  process.exit(1);
});
