const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function stripId(raw) {
  const s = String(raw || '').trim();
  const n = s.replace(/^0+/, '');
  return n === '' ? '0' : n;
}

function loadEnvPassword() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = env.match(/^DB_PASSWORD=(.*)$/m);
  return m ? m[1].trim() : '';
}

(async () => {
  const findings = JSON.parse(fs.readFileSync(path.join(__dirname, '_july-findings.json'), 'utf8'));
  const excelSummary = JSON.parse(fs.readFileSync(path.join(__dirname, '_july-excel-summary.json'), 'utf8'));
  const svodPeople = Object.keys(excelSummary.sheets ? {} : {});

  // reload excel people from findings.excel isn't enough; parse from previous full script output file if needed
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('c:\\Users\\G15\\Downloads\\Выработка комплектация.xlsx');
  const ws = wb.worksheets.find((s) => s.name === 'Свод для ЗП');
  const people = new Set();
  const byPersonWcr = {};
  const byPerson = {};
  let header = 3;
  ws.eachRow((row, i) => {
    const a = String(row.getCell(1).value || '');
    if (a.includes('Правило')) header = i;
  });
  ws.eachRow((row, i) => {
    if (i <= header) return;
    const wcr = String(row.getCell(1).value || '').trim();
    const pers = stripId(row.getCell(3).value);
    const qty = Number(row.getCell(7).value || 0);
    const name = String(row.getCell(2).value || '').trim();
    if (!wcr || !pers) return;
    people.add(pers);
    byPerson[pers] = byPerson[pers] || { pers, name, qty: 0 };
    byPerson[pers].qty += qty;
    const k = pers + '|' + wcr;
    byPersonWcr[k] = (byPersonWcr[k] || 0) + qty;
  });
  const persList = [...people];

  const password = loadEnvPassword();
  let pool;
  for (let i = 1; i <= 3; i++) {
    try {
      pool = await sql.connect({
        server: 'PRM-SRV-MSSQL-01.komus.net',
        port: 59587,
        database: 'SalaryMonitor',
        user: 'sa',
        password,
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 90000,
        requestTimeout: 180000,
      });
      break;
    } catch (e) {
      console.error('connect', i, e.code || e.message);
      if (i === 3) throw e;
    }
  }

  const inList = persList.map((p) => `'${p}'`).join(',');
  const excelWcrs = findings.excel['Свод для ЗП'].wcrs;
  const wcrIn = excelWcrs.map((w) => `'${w}'`).concat(`'DEF'`).join(',');

  const mapping = await pool.request().query(`
    SELECT wcr_code, operation_type, participant_area, is_active
    FROM wcr_mapping
    WHERE wcr_code IN ('RPL1','RPL2','RPL3','RPL5','IN02','IN03','PU02','UNDE','DEFF','DEF','P3BL','P3BM','P3BS','PHSM','PS1L')
    ORDER BY wcr_code
  `);
  const normsHit = await pool.request().query(`
    SELECT wcr_code, description, norm_type, norm_value, is_active
    FROM wcr_norms
    WHERE wcr_code IN ('RPL1','RPL2','RPL3','RPL5','IN02','IN03','PU02','UNDE','DEFF','DEF','P3BL','P3BM','P3BS','PHSM')
  `);
  const loginovskaya = await pool.request().query(`
    SELECT LTRIM(RTRIM(o.wcr_code)) wcr_code, o.warehouse_code,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) prod
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20)) = '85916'
    GROUP BY LTRIM(RTRIM(o.wcr_code)), o.warehouse_code
    ORDER BY SUM(CAST(ISNULL(o.count,0) AS FLOAT)) DESC
  `);

  const missingOps = await pool.request().query(`
    SELECT LTRIM(RTRIM(wcr_code)) wcr_code, COUNT(*) n,
      SUM(CAST(ISNULL(count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(prod_count,0) AS FLOAT)) prod,
      SUM(CAST(ISNULL(amount,0) AS FLOAT)) amt
    FROM operations
    WHERE operation_date >= '2026-07-01' AND operation_date < '2026-08-01'
      AND LTRIM(RTRIM(ISNULL(wcr_code,''))) IN ('IN02','IN03','PU02','UNDE','DEFF','P3BL','P3BM','P3BS','PHSM','RPL5')
    GROUP BY LTRIM(RTRIM(wcr_code))
  `);

  const rplMap = await pool.request().query(`
    SELECT o.wcr_code, o.operation_type, o.aarea, o.warehouse_code,
      COUNT(*) n, SUM(CAST(count AS FLOAT)) aei, SUM(CAST(amount AS FLOAT)) amt
    FROM operations o
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.wcr_code IN ('RPL1','RPL2','RPL3','RPL5')
    GROUP BY o.wcr_code, o.operation_type, o.aarea, o.warehouse_code
    ORDER BY SUM(CAST(amount AS FLOAT)) DESC
  `);

  const persExpr = `CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20))`;
  const excelPeopleDb = await pool.request().query(`
    SELECT
      ${persExpr} AS pers,
      MAX(u.fio) fio,
      MAX(o.warehouse_code) wh_sample,
      COUNT(DISTINCT o.warehouse_code) wh_n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei_all,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) prod_all,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) amt_all,
      SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN CAST(ISNULL(o.count,0) AS FLOAT) ELSE 0 END) aei_pick,
      SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN CAST(ISNULL(o.prod_count,0) AS FLOAT) ELSE 0 END) prod_pick,
      SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN CAST(ISNULL(o.amount,0) AS FLOAT) ELSE 0 END) amt_pick,
      SUM(CASE WHEN o.warehouse_code='02DQ' AND wp.wcr_code IS NOT NULL THEN CAST(ISNULL(o.count,0) AS FLOAT) ELSE 0 END) aei_pick_02dq
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND ${persExpr} IN (${inList})
    GROUP BY ${persExpr}
  `);

  const pkm = await pool.request().query(`
    SELECT wcr_code,
      SUM(CAST(ISNULL(count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(prod_count,0) AS FLOAT)) prod
    FROM operations
    WHERE operation_date >= '2026-07-01' AND operation_date < '2026-08-01'
      AND wcr_code IN ('PKM2','PKM4','PKM5','PKMC','P2M2','P2M4','P2M5','P2MC','DEFF','DEF')
      AND warehouse_code = '02DQ'
    GROUP BY wcr_code
  `);

  const match02dq = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(o.wcr_code)) wcr_code,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) amt
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '02DQ'
      AND CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20)) IN (${inList})
    GROUP BY LTRIM(RTRIM(o.wcr_code))
  `);

  const person64694 = await pool.request().query(`
    SELECT u.employee_id, u.fio, u.is_active,
      COUNT(o.id) n, SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei
    FROM users u
    LEFT JOIN operations o ON o.user_id = u.id
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    WHERE CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20)) IN ('64694','91959')
    GROUP BY u.employee_id, u.fio, u.is_active
  `);

  const ps1l = await pool.request().query(`
    SELECT o.warehouse_code, COUNT(*) n,
      SUM(CAST(count AS FLOAT)) aei, SUM(CAST(prod_count AS FLOAT)) prod
    FROM operations o
    WHERE o.wcr_code = 'PS1L'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY o.warehouse_code
  `);

  const extraDbPeopleWh = await pool.request().query(`
    SELECT TOP 15
      CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20)) pers,
      MAX(u.fio) fio,
      MAX(o.warehouse_code) wh,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) prod
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20)) NOT IN (${inList})
    GROUP BY CAST(TRY_CAST(u.employee_id AS INT) AS VARCHAR(20))
    ORDER BY SUM(CAST(ISNULL(o.count,0) AS FLOAT)) DESC
  `);

  await pool.close();

  const dbP = new Map(excelPeopleDb.recordset.map((r) => [stripId(r.pers), r]));
  const personMatch = persList.map((pers) => {
    const e = byPerson[pers];
    const d = dbP.get(pers);
    const excel = e.qty;
    const aei = d ? Number(d.aei_pick || 0) : 0;
    const aei02 = d ? Number(d.aei_pick_02dq || 0) : 0;
    const prod = d ? Number(d.prod_pick || 0) : 0;
    return {
      pers,
      name: e.name,
      excel,
      dbAeiPick: aei,
      dbAei02dq: aei02,
      dbProd: prod,
      deltaAei: aei - excel,
      delta02: aei02 - excel,
      exactAei: Math.abs(aei - excel) < 0.5,
      exact02: Math.abs(aei02 - excel) < 0.5,
      closeAei: Math.abs(aei - excel) / Math.max(excel, 1) < 0.02,
      close02: Math.abs(aei02 - excel) / Math.max(excel, 1) < 0.02,
    };
  }).sort((a, b) => Math.abs(b.deltaAei) - Math.abs(a.deltaAei));

  const dbWcr02 = new Map(match02dq.recordset.map((r) => [String(r.wcr_code).trim(), r]));
  const svodByWcr = {};
  // from findings topWcr + excel
  for (const w of findings.topWcr) svodByWcr[w.wcr] = w.excelSvod;
  // better: from excel file parse
  const wcrExcel = {};
  ws.eachRow((row, i) => {
    if (i <= header) return;
    const wcr = String(row.getCell(1).value || '').trim();
    const qty = Number(row.getCell(7).value || 0);
    if (!wcr) return;
    wcrExcel[wcr] = (wcrExcel[wcr] || 0) + qty;
  });

  const wcr02 = Object.keys({ ...wcrExcel, ...Object.fromEntries([...dbWcr02.keys()].map((k) => [k, 1])) }).map((wcr) => {
    const excel = wcrExcel[wcr] || 0;
    const d = dbWcr02.get(wcr) || {};
    const aei = Number(d.aei || 0);
    const prod = Number(d.prod || 0);
    return {
      wcr,
      excel,
      aei02dqExcelPeople: aei,
      prod02dq: prod,
      deltaAei: aei - excel,
      pct: excel ? Math.round((100 * (aei - excel)) / excel * 10) / 10 : null,
      close: excel > 0 && Math.abs(aei - excel) / excel < 0.02,
    };
  }).filter((r) => r.excel > 0 || r.aei02dqExcelPeople > 0)
    .sort((a, b) => Math.abs(b.deltaAei) - Math.abs(a.deltaAei));

  const out = {
    mapping: mapping.recordset,
    normsHit: normsHit.recordset,
    loginovskaya: loginovskaya.recordset,
    missingOpsJuly: missingOps.recordset,
    rplBreakdown: rplMap.recordset,
    pkm02dq: pkm.recordset,
    person64694: person64694.recordset,
    ps1lByWh: ps1l.recordset,
    extraDbPeople: extraDbPeopleWh.recordset,
    personMatchStats: {
      n: personMatch.length,
      exactAei: personMatch.filter((p) => p.exactAei).length,
      exact02: personMatch.filter((p) => p.exact02).length,
      closeAei: personMatch.filter((p) => p.closeAei).length,
      close02: personMatch.filter((p) => p.close02).length,
    },
    personMatch,
    wcr02Stats: {
      nExcel: Object.keys(wcrExcel).length,
      close: wcr02.filter((w) => w.close).length,
      excelQty: Object.values(wcrExcel).reduce((s, n) => s + n, 0),
      dbAeiExcelPeople02dq: wcr02.reduce((s, w) => s + w.aei02dqExcelPeople, 0),
    },
    wcr02Top: wcr02.slice(0, 20),
  };

  const findingsPath = path.join(__dirname, '_july-findings.json');
  const prev = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  prev.round2 = out;
  prev.verdict = {
    officialQtyIsAei: true,
    evidence: 'Байыш 100022: Excel Свод 141735 = DB count 141735, prod_count=13443',
    currentAppFormula: 'prod_count × picking rate',
    shouldBe: 'count (AEI) × picking rate to match official July dump',
    warehouse: 'Excel dump is 34 people, not warehouse 01SS; 02DQ is main. 01SS picking AEI only 1863.',
    rpl2: 'RPL2 billed as ФС_Коробочная комплектация at 5.9 × AEI → ~1.55 млн ₽; not in official Свод',
  };
  fs.writeFileSync(findingsPath, JSON.stringify(prev, null, 2));
  console.log(JSON.stringify({
    mapping: out.mapping,
    normsHit: out.normsHit,
    loginovskaya: out.loginovskaya,
    missingOpsJuly: out.missingOpsJuly,
    rplBreakdown: out.rplBreakdown.slice(0, 12),
    pkm02dq: out.pkm02dq,
    person64694: out.person64694,
    ps1lByWh: out.ps1lByWh,
    extraDbPeople: out.extraDbPeople.slice(0, 8),
    personMatchStats: out.personMatchStats,
    personMatchTop: out.personMatch.slice(0, 10),
    exactPeople: out.personMatch.filter((p) => p.exactAei || p.exact02).map((p) => p.pers + ' ' + p.excel + '/' + p.dbAeiPick),
    wcr02Stats: out.wcr02Stats,
    wcr02Top: out.wcr02Top.slice(0, 12),
  }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
