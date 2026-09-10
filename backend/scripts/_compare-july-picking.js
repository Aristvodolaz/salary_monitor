const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const sql = require('mssql');

const config = {
  server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net',
  port: parseInt(process.env.DB_PORT || '59587', 10),
  database: process.env.DB_NAME || 'SalaryMonitor',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 180000,
};

function stripId(raw) {
  const s = String(raw || '').trim();
  const n = s.replace(/^0+/, '');
  return n === '' ? '0' : n;
}

function ymd(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadSheet(wb, ws) {
  const rows = [];
  let headerRow = 1;
  ws.eachRow((row, i) => {
    const a = row.getCell(1).value;
    if (a && String(a).includes('процесс') || (a && String(a).toLowerCase().includes('складск'))) {
      headerRow = i;
    }
  });
  ws.eachRow((row, i) => {
    const wcr = String(row.getCell(1).value || '').trim();
    if (!wcr || i <= headerRow) return;
    if (wcr.length > 12) return;
    const name = String(row.getCell(2).value || '').trim();
    const pers = String(row.getCell(3).value || '').trim();
    if (!pers) return;
    const qty = Number(row.getCell(7).value || 0);
    rows.push({
      wcr,
      name,
      pers: stripId(pers),
      persRaw: pers,
      date: ymd(row.getCell(6).value),
      qty,
    });
  });
  return { sheet: ws.name, rows };
}

async function loadExcel() {
  const file = 'c:\\Users\\G15\\Downloads\\Выработка комплектация.xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const all = {};
  for (const ws of wb.worksheets) {
    all[ws.name] = await loadSheet(wb, ws);
  }
  const preferred =
    all['Свод для ЗП'] ||
    Object.values(all).find((s) => s.sheet.includes('ЗП')) ||
    all['Data'] ||
    Object.values(all)[0];
  return { all, preferred };
}

async function main() {
  if (!config.password) {
    // fallback from backend env file without printing it
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = env.match(/^DB_PASSWORD=(.*)$/m);
    if (m) config.password = m[1].trim();
  }

  const loaded = await loadExcel();
  const sheetsInfo = Object.fromEntries(
    Object.entries(loaded.all).map(([k, v]) => [
      k,
      { rows: v.rows.length, qty: v.rows.reduce((s, r) => s + r.qty, 0) },
    ]),
  );
  const excel = loaded.preferred;
  const pool = await sql.connect(config);

  const norms = await pool.request().query(`
    SELECT wcr_code, participant_area, picking_type, norm_label, rate, is_active
    FROM wcr_picking_norms
  `);
  const normBy = new Map(norms.recordset.map((r) => [String(r.wcr_code).trim(), r]));

  const dbWcr = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(ISNULL(o.wcr_code, ''))) AS wcr_code,
      SUM(CAST(ISNULL(o.prod_count, 0) AS FLOAT)) AS qty,
      SUM(CAST(ISNULL(o.amount, 0) AS FLOAT)) AS amt,
      COUNT(*) AS n
    FROM operations o
    WHERE o.operation_date >= '2026-07-01'
      AND o.operation_date < '2026-08-01'
    GROUP BY LTRIM(RTRIM(ISNULL(o.wcr_code, '')))
  `);

  const dbPerson = await pool.request().query(`
    SELECT
      u.employee_id,
      MAX(u.fio) AS fio,
      SUM(CAST(ISNULL(o.prod_count, 0) AS FLOAT)) AS qty,
      SUM(CAST(ISNULL(o.amount, 0) AS FLOAT)) AS amt,
      COUNT(*) AS n
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01'
      AND o.operation_date < '2026-08-01'
    GROUP BY u.employee_id
  `);

  const dbMeta = await pool.request().query(`
    SELECT
      COUNT(*) AS n,
      MIN(CAST(o.operation_date AS DATE)) AS dmin,
      MAX(CAST(o.operation_date AS DATE)) AS dmax,
      SUM(CAST(ISNULL(o.prod_count, 0) AS FLOAT)) AS qty
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01'
      AND o.operation_date < '2026-08-01'
  `);

  await pool.close();

  const excelByPerson = new Map();
  const excelByWcr = new Map();
  const excelUnknown = new Map();
  let excelQty = 0;
  let excelAmtKnown = 0;
  let excelQtyKnown = 0;
  let excelQtyUnknown = 0;

  for (const r of excel.rows) {
    excelQty += r.qty;
    const n = normBy.get(r.wcr);
    if (!n || n.rate == null) {
      excelQtyUnknown += r.qty;
      excelUnknown.set(r.wcr, (excelUnknown.get(r.wcr) || 0) + r.qty);
    } else {
      excelQtyKnown += r.qty;
      excelAmtKnown += r.qty * n.rate;
    }
    const pk = r.pers;
    if (!excelByPerson.has(pk)) excelByPerson.set(pk, { pers: pk, name: r.name, qty: 0, amt: 0, qtyAll: 0, rows: 0 });
    const p = excelByPerson.get(pk);
    p.qtyAll += r.qty;
    p.rows += 1;
    if (n && n.rate != null) {
      p.qty += r.qty;
      p.amt += r.qty * n.rate;
    }
    if (!excelByWcr.has(r.wcr)) excelByWcr.set(r.wcr, { wcr: r.wcr, qty: 0, amt: 0, people: new Set() });
    const w = excelByWcr.get(r.wcr);
    w.qty += r.qty;
    w.amt += n && n.rate != null ? r.qty * n.rate : 0;
    w.people.add(pk);
  }

  const dbByPerson = new Map();
  const dbByWcr = new Map();
  let dbQtyPicking = 0;
  let dbAmtPicking = 0;
  let dbRowsPicking = 0;

  for (const r of dbPerson.recordset) {
    const pers = stripId(r.employee_id);
    const qty = Number(r.qty || 0);
    const amt = Number(r.amt || 0);
    dbQtyPicking += qty;
    dbAmtPicking += amt;
    dbRowsPicking += Number(r.n || 0);
    dbByPerson.set(pers, { pers, fio: r.fio, qty, amt, rows: Number(r.n || 0) });
  }
  for (const r of dbWcr.recordset) {
    const wcr = String(r.wcr_code || '').trim();
    dbByWcr.set(wcr, { wcr, qty: Number(r.qty || 0), amt: Number(r.amt || 0), n: Number(r.n || 0) });
  }

  const personDiff = [];
  const allPers = new Set([...excelByPerson.keys(), ...dbByPerson.keys()]);
  for (const pers of allPers) {
    const e = excelByPerson.get(pers) || { qty: 0, amt: 0, name: '', rows: 0 };
    const d = dbByPerson.get(pers) || { qty: 0, amt: 0, fio: '', rows: 0 };
    const dq = d.qty - e.qty;
    const da = d.amt - e.amt;
    if (Math.abs(dq) > 0.5 || Math.abs(da) > 1) {
      personDiff.push({
        pers,
        excelName: e.name,
        dbFio: d.fio,
        excelQty: Math.round(e.qty),
        dbQty: Math.round(d.qty),
        deltaQty: Math.round(dq),
        excelAmt: Math.round(e.amt * 100) / 100,
        dbAmt: Math.round(d.amt * 100) / 100,
        deltaAmt: Math.round(da * 100) / 100,
        inExcel: excelByPerson.has(pers),
        inDb: dbByPerson.has(pers) && (d.qty > 0 || d.rows > 0),
      });
    }
  }
  personDiff.sort((a, b) => Math.abs(b.deltaAmt) - Math.abs(a.deltaAmt));

  const wcrDiff = [];
  const allWcr = new Set([...excelByWcr.keys(), ...dbByWcr.keys()]);
  for (const wcr of allWcr) {
    const e = excelByWcr.get(wcr) || { qty: 0, amt: 0 };
    const d = dbByWcr.get(wcr) || { qty: 0, amt: 0 };
    const n = normBy.get(wcr);
    const dq = d.qty - e.qty;
    if (Math.abs(dq) > 0.5 || (!n && e.qty > 0) || (n && !excelByWcr.has(wcr) && d.qty > 0)) {
      wcrDiff.push({
        wcr,
        inNorms: Boolean(n),
        rate: n ? n.rate : null,
        label: n ? n.norm_label : null,
        excelQty: Math.round(e.qty),
        dbQty: Math.round(d.qty),
        deltaQty: Math.round(dq),
        excelAmt: Math.round((e.amt || 0) * 100) / 100,
        dbAmt: Math.round((d.amt || 0) * 100) / 100,
      });
    }
  }
  wcrDiff.sort((a, b) => Math.abs(b.deltaQty) - Math.abs(a.deltaQty));

  const dates = [...new Set(excel.rows.map((r) => r.date))].sort();
  const result = {
    sheetsInfo,
    excelRows: excel.rows.length,
    excelPeople: excelByPerson.size,
    excelWcr: excelByWcr.size,
    dateMin: dates[0],
    dateMax: dates[dates.length - 1],
    dateCount: dates.length,
    excelQty,
    excelQtyKnown,
    excelQtyUnknown,
    excelAmtKnown: Math.round(excelAmtKnown * 100) / 100,
    dbMeta: dbMeta.recordset[0],
    dbRowsPicking,
    dbQtyPicking,
    dbAmtPicking: Math.round(dbAmtPicking * 100) / 100,
    deltaQty: Math.round(dbQtyPicking - excelQtyKnown),
    deltaAmt: Math.round((dbAmtPicking - excelAmtKnown) * 100) / 100,
    unknownWcrs: [...excelUnknown.entries()]
      .map(([wcr, qty]) => ({ wcr, qty }))
      .sort((a, b) => b.qty - a.qty),
    personDiff: personDiff.slice(0, 40),
    personDiffCount: personDiff.length,
    wcrDiff: wcrDiff.slice(0, 50),
    wcrDiffCount: wcrDiff.length,
    sampleDates: dates.slice(0, 5).concat(dates.slice(-3)),
  };

  const out = path.join(__dirname, '_july-compare.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  console.log('WROTE', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
