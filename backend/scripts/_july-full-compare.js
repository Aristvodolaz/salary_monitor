const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const sql = require('mssql');

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

function cellVal(cell) {
  const v = cell && cell.value;
  if (v == null) return null;
  if (typeof v === 'object' && v.result != null) return v.result;
  if (typeof v === 'object' && v.text != null) return v.text;
  return v;
}

function parseSheet(ws) {
  let headerRow = 1;
  const headerCells = [];
  ws.eachRow((row, i) => {
    const a = String(cellVal(row.getCell(1)) || '');
    if (a.includes('Правило') || a.toLowerCase().includes('склад') || a.toLowerCase().includes('wcr')) {
      headerRow = i;
      for (let c = 1; c <= 12; c++) headerCells.push(String(cellVal(row.getCell(c)) || ''));
    }
  });
  const rows = [];
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const wcr = String(cellVal(row.getCell(1)) || '').trim();
    if (!wcr || wcr.length > 12) return;
    const name = String(cellVal(row.getCell(2)) || '').trim();
    const persRaw = String(cellVal(row.getCell(3)) || '').trim();
    if (!persRaw) return;
    const fio = [cellVal(row.getCell(4)), cellVal(row.getCell(5))]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join(' ');
    const qty = Number(cellVal(row.getCell(7)) || 0);
    rows.push({
      wcr,
      name,
      pers: stripId(persRaw),
      persRaw,
      fio,
      date: ymd(cellVal(row.getCell(6))),
      qty,
    });
  });
  const byWcr = {};
  const byPers = {};
  const dates = new Set();
  for (const r of rows) {
    dates.add(r.date);
    byWcr[r.wcr] = (byWcr[r.wcr] || 0) + r.qty;
    if (!byPers[r.pers]) byPers[r.pers] = { pers: r.pers, name: r.name, fio: r.fio, qty: 0, wcrs: new Set() };
    byPers[r.pers].qty += r.qty;
    byPers[r.pers].wcrs.add(r.wcr);
  }
  return {
    sheet: ws.name,
    headerRow,
    headers: headerCells,
    rows: rows.length,
    qty: rows.reduce((s, r) => s + r.qty, 0),
    people: Object.keys(byPers).length,
    wcrs: Object.keys(byWcr).sort(),
    wcrCount: Object.keys(byWcr).length,
    byWcr,
    byPers,
    dateMin: [...dates].filter(Boolean).sort()[0] || null,
    dateMax: [...dates].filter(Boolean).sort().slice(-1)[0] || null,
    dateCount: dates.size,
    datesSample: [...dates].filter(Boolean).sort().slice(0, 8),
  };
}

function loadEnvPassword() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = env.match(/^DB_PASSWORD=(.*)$/m);
  return m ? m[1].trim() : '';
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
    connectionTimeout: 90000,
    requestTimeout: 180000,
  };
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const pool = await sql.connect(cfg);
      return pool;
    } catch (e) {
      lastErr = e;
      console.error('DB connect attempt', i, e.code || e.message);
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw lastErr;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

(async () => {
  const file = 'c:\\Users\\G15\\Downloads\\Выработка комплектация.xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets = {};
  for (const ws of wb.worksheets) sheets[ws.name] = parseSheet(ws);

  const svod = sheets['Свод для ЗП'];
  const list1 = sheets['Лист1'];
  const data = sheets['Data'];

  const extraWcrSvodVsData = svod.wcrs.filter((w) => !data.wcrs.includes(w));
  const extraWcrDataVsSvod = data.wcrs.filter((w) => !svod.wcrs.includes(w));
  const extraPeopleSvod = Object.keys(svod.byPers).filter((p) => !data.byPers[p]);
  const extraPeopleData = Object.keys(data.byPers).filter((p) => !svod.byPers[p]);

  const wcrSvodVsData = Object.keys({ ...svod.byWcr, ...data.byWcr })
    .map((w) => ({
      wcr: w,
      svod: svod.byWcr[w] || 0,
      data: data.byWcr[w] || 0,
      list1: list1.byWcr[w] || 0,
      deltaSvodData: (svod.byWcr[w] || 0) - (data.byWcr[w] || 0),
    }))
    .sort((a, b) => Math.abs(b.deltaSvodData) - Math.abs(a.deltaSvodData));

  const excelOut = {
    sheets: Object.fromEntries(
      Object.entries(sheets).map(([k, v]) => [
        k,
        {
          rows: v.rows,
          qty: v.qty,
          people: v.people,
          wcrCount: v.wcrCount,
          wcrs: v.wcrs,
          headers: v.headers,
          dateMin: v.dateMin,
          dateMax: v.dateMax,
          dateCount: v.dateCount,
          datesSample: v.datesSample,
        },
      ]),
    ),
    extraWcrSvodVsData,
    extraWcrDataVsSvod,
    extraPeopleSvod,
    extraPeopleDataCount: extraPeopleData.length,
    extraPeopleData: extraPeopleData.slice(0, 30),
    topWcrSvodVsData: wcrSvodVsData.slice(0, 25),
    person100022: {
      svod: svod.byPers['100022']
        ? { qty: svod.byPers['100022'].qty, name: svod.byPers['100022'].name }
        : null,
      list1: list1.byPers['100022']
        ? { qty: list1.byPers['100022'].qty, name: list1.byPers['100022'].name }
        : null,
      data: data.byPers['100022']
        ? { qty: data.byPers['100022'].qty, name: data.byPers['100022'].name }
        : null,
    },
  };
  fs.writeFileSync(path.join(__dirname, '_july-excel-summary.json'), JSON.stringify(excelOut, null, 2));
  console.log('EXCEL_OK', JSON.stringify({
    svod: { rows: svod.rows, qty: svod.qty, people: svod.people, wcrs: svod.wcrCount, dates: svod.dateCount },
    list1: { rows: list1.rows, qty: list1.qty, people: list1.people, wcrs: list1.wcrCount, dates: list1.dateCount },
    data: { rows: data.rows, qty: data.qty, people: data.people, wcrs: data.wcrCount, dates: data.dateCount, dateMin: data.dateMin, dateMax: data.dateMax },
    extraWcrSvodVsData,
    extraWcrDataVsSvod,
    extraPeopleSvod,
    extraPeopleDataCount: extraPeopleData.length,
  }, null, 2));

  console.log('CONNECTING_DB...');
  const pool = await connectDb();
  console.log('DB_OK');

  const missingExcelWcrs = ['DEFF', 'DEF', 'P3BL', 'P3BM', 'PHSM', 'P3BS', 'IN02', 'IN03', 'PU02', 'RPL1', 'RPL2', 'RPL5', 'UNDE'];

  const pickingTot = await pool.request().query(`
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      COUNT(DISTINCT o.warehouse_code) AS warehouses,
      MIN(CAST(o.operation_date AS DATE)) AS dmin,
      MAX(CAST(o.operation_date AS DATE)) AS dmax
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
  `);

  const picking01ss = await pool.request().query(`
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND o.warehouse_code = '01SS'
  `);

  const allJuly = await pool.request().query(`
    SELECT
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
  `);

  const wh = await pool.request().query(`
    SELECT
      o.warehouse_code,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY o.warehouse_code
    ORDER BY SUM(CAST(ISNULL(o.count,0) AS FLOAT)) DESC
  `);

  const norms = await pool.request().query(`
    SELECT wcr_code, participant_area, picking_type, norm_label, rate, is_active
    FROM wcr_picking_norms
  `);
  const normBy = new Map(norms.recordset.map((r) => [String(r.wcr_code).trim(), r]));

  const dbWcr = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(ISNULL(o.wcr_code,''))) AS wcr_code,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      MAX(wp.rate) AS picking_rate,
      MAX(t.rate) AS tariff_rate,
      MAX(o.operation_type) AS operation_type
    FROM operations o
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    LEFT JOIN tariffs t ON
      (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND t.is_active = 1
      AND o.operation_date >= t.valid_from
      AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY LTRIM(RTRIM(ISNULL(o.wcr_code,'')))
  `);

  const dbPersonPicking = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(REPLACE(LTRIM(REPLACE(ISNULL(u.employee_id,''),'0',' ')),' ','0'))) AS pers_raw,
      u.employee_id,
      MAX(u.fio) AS fio,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    GROUP BY u.employee_id
  `);

  const missingIn = missingExcelWcrs.map((w) => `'${w}'`).join(',');
  const missingDb = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(ISNULL(o.wcr_code,''))) AS wcr_code,
      COUNT(*) AS n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) AS aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) AS prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) AS amt,
      MAX(o.operation_type) AS operation_type,
      MAX(wp.rate) AS picking_rate,
      MAX(t.rate) AS tariff_rate
    FROM operations o
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    LEFT JOIN tariffs t ON
      (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
      AND o.operation_type = t.operation_type
      AND t.is_active = 1
      AND o.operation_date >= t.valid_from
      AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND LTRIM(RTRIM(ISNULL(o.wcr_code,''))) IN (${missingIn})
    GROUP BY LTRIM(RTRIM(ISNULL(o.wcr_code,'')))
  `);

  const bayysh = await pool.request().query(`
    SELECT
      u.employee_id, u.fio,
      COUNT(*) n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND (
        REPLACE(LTRIM(REPLACE(ISNULL(u.employee_id,''),'0',' ')),' ','0') = '100022'
        OR u.employee_id LIKE '%100022'
      )
    GROUP BY u.employee_id, u.fio
  `);

  const bayyshPicking = await pool.request().query(`
    SELECT
      COUNT(*) n,
      SUM(CAST(ISNULL(o.count,0) AS FLOAT)) aei,
      SUM(CAST(ISNULL(o.prod_count,0) AS FLOAT)) prod,
      SUM(CAST(ISNULL(o.amount,0) AS FLOAT)) amt
    FROM operations o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
    WHERE o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
      AND REPLACE(LTRIM(REPLACE(ISNULL(u.employee_id,''),'0',' ')),' ','0') = '100022'
  `);

  const rpl2 = await pool.request().query(`
    SELECT TOP 5
      o.wcr_code, o.operation_type, o.warehouse_code,
      o.count, o.prod_count, o.amount
    FROM operations o
    WHERE o.wcr_code = 'RPL2'
      AND o.operation_date >= '2026-07-01' AND o.operation_date < '2026-08-01'
    ORDER BY o.amount DESC
  `);

  await pool.close();

  const dbWcrMap = new Map(dbWcr.recordset.map((r) => [String(r.wcr_code).trim(), r]));
  const dbPersMap = new Map();
  for (const r of dbPersonPicking.recordset) {
    dbPersMap.set(stripId(r.employee_id), r);
  }

  const excelByWcr = svod.byWcr;
  const wcrCmp = Object.keys({ ...excelByWcr, ...Object.fromEntries([...dbWcrMap.keys()].map((k) => [k, 1])) })
    .map((wcr) => {
      const e = excelByWcr[wcr] || 0;
      const d = dbWcrMap.get(wcr) || {};
      const n = normBy.get(wcr);
      const aei = Number(d.aei || 0);
      const prod = Number(d.prod || 0);
      return {
        wcr,
        inNorms: Boolean(n),
        rate: n ? n.rate : null,
        label: n ? n.norm_label : null,
        excelSvod: e,
        excelData: data.byWcr[wcr] || 0,
        dbAei: aei,
        dbProd: prod,
        dbAmt: round2(d.amt),
        dbN: Number(d.n || 0),
        pickingRate: d.picking_rate != null ? Number(d.picking_rate) : null,
        tariffRate: d.tariff_rate != null ? Number(d.tariff_rate) : null,
        deltaAei: aei - e,
        deltaProd: prod - e,
        absAei: Math.abs(aei - e),
        absProd: Math.abs(prod - e),
        better: Math.abs(aei - e) <= Math.abs(prod - e) ? 'aei' : 'prod',
      };
    })
    .filter((r) => r.excelSvod > 0 || r.dbAei > 0 || r.dbProd > 0 || (data.byWcr[r.wcr] || 0) > 0)
    .sort((a, b) => Math.abs(b.excelSvod - b.dbAei) - Math.abs(a.excelSvod - a.dbAei));

  const personCmp = Object.keys({ ...svod.byPers, ...Object.fromEntries([...dbPersMap.keys()].map((k) => [k, 1])) })
    .map((pers) => {
      const e = svod.byPers[pers];
      const d = dbPersMap.get(pers);
      const excelQty = e ? e.qty : 0;
      const aei = d ? Number(d.aei || 0) : 0;
      const prod = d ? Number(d.prod || 0) : 0;
      return {
        pers,
        excelName: e ? e.name : '',
        dbFio: d ? d.fio : '',
        excelSvod: excelQty,
        excelData: data.byPers[pers] ? data.byPers[pers].qty : 0,
        dbAei: aei,
        dbProd: prod,
        dbAmt: d ? round2(d.amt) : 0,
        impliedAmtAei: e && normBy.size ? null : null,
        deltaAei: aei - excelQty,
        deltaProd: prod - excelQty,
        better: Math.abs(aei - excelQty) <= Math.abs(prod - excelQty) ? 'aei' : 'prod',
        inExcel: Boolean(e),
        inDb: Boolean(d),
      };
    })
    .filter((r) => Math.abs(r.deltaAei) > 0.5 || Math.abs(r.deltaProd) > 0.5 || r.excelSvod > 0 || r.dbProd > 0)
    .sort((a, b) => Math.abs(b.excelSvod - b.dbAei) - Math.abs(a.excelSvod - a.dbAei));

  // implied excel amount at picking rates (AEI × rate for known WCRs)
  let excelAmtAei = 0;
  let excelAmtProdWouldBe = 0;
  let excelQtyKnown = 0;
  const unknownWcrs = {};
  for (const [wcr, qty] of Object.entries(svod.byWcr)) {
    const n = normBy.get(wcr) || (wcr === 'DEFF' ? normBy.get('DEF') : null);
    if (n && n.rate != null) {
      excelQtyKnown += qty;
      excelAmtAei += qty * n.rate;
    } else {
      unknownWcrs[wcr] = qty;
    }
  }

  const picking = pickingTot.recordset[0];
  const aeiBetterCount = wcrCmp.filter((w) => w.excelSvod > 0 && w.better === 'aei').length;
  const prodBetterCount = wcrCmp.filter((w) => w.excelSvod > 0 && w.better === 'prod').length;

  const findings = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: 'Свод для ЗП',
    excel: excelOut.sheets,
    sheetInconsistency: {
      svodQty: svod.qty,
      list1Qty: list1.qty,
      dataQty: data.qty,
      svodMinusData: svod.qty - data.qty,
      extraWcrSvodVsData,
      extraWcrDataVsSvod,
      extraPeopleSvod,
      extraPeopleDataCount: extraPeopleData.length,
      note: 'Свод для ЗП — помесячный свод для ЗП; Data/Лист1 совпадают по qty и меньше свода.',
    },
    db: {
      allJuly: allJuly.recordset[0],
      pickingJuly: pickingTot.recordset[0],
      picking01ss: picking01ss.recordset[0],
      warehouses: wh.recordset,
    },
    formula: {
      current: 'комплектация = prod_count × rate (wcr_picking_norms); прочее = count × tariff',
      officialFileQtyField: 'Суммарное кол-во АЕИ в продуктовых задач (AEI, не ZprodWtItm)',
      verdictHypothesis: 'Excel qty ближе к operations.count (AEI), чем к prod_count',
    },
    totals: {
      excelSvodQty: svod.qty,
      excelDataQty: data.qty,
      excelQtyKnownInNorms: excelQtyKnown,
      excelImpliedAmtAeiXrate: round2(excelAmtAei),
      dbPickingAei: Number(picking.aei || 0),
      dbPickingProd: Number(picking.prod || 0),
      dbPickingAmt: round2(picking.amt),
      dbPickingN: Number(picking.n || 0),
      deltaAeiVsSvod: Number(picking.aei || 0) - svod.qty,
      deltaProdVsSvod: Number(picking.prod || 0) - svod.qty,
      deltaAeiVsKnown: Number(picking.aei || 0) - excelQtyKnown,
      deltaProdVsKnown: Number(picking.prod || 0) - excelQtyKnown,
      aeiBetterWcrCount: aeiBetterCount,
      prodBetterWcrCount: prodBetterCount,
    },
    unknownWcrs,
    missingWcrsInDb: missingDb.recordset,
    bayysh: {
      excelSvod: svod.byPers['100022'] ? svod.byPers['100022'].qty : 0,
      excelData: data.byPers['100022'] ? data.byPers['100022'].qty : 0,
      dbAll: bayysh.recordset,
      dbPicking: bayyshPicking.recordset[0],
    },
    rpl2Samples: rpl2.recordset,
    topWcr: wcrCmp.slice(0, 30),
    topPeople: personCmp.slice(0, 25),
    peopleOnlyExcel: personCmp.filter((p) => p.inExcel && !p.inDb).slice(0, 20),
    peopleOnlyDb: personCmp.filter((p) => !p.inExcel && p.inDb).slice(0, 20),
    personDiffCount: personCmp.length,
    wcrDiffCount: wcrCmp.length,
  };

  fs.writeFileSync(path.join(__dirname, '_july-findings.json'), JSON.stringify(findings, null, 2));
  console.log('WROTE findings');
  console.log(JSON.stringify({
    totals: findings.totals,
    pickingJuly: findings.db.pickingJuly,
    picking01ss: findings.db.picking01ss,
    warehouses: findings.db.warehouses,
    unknownWcrs: findings.unknownWcrs,
    missingWcrsInDb: findings.missingWcrsInDb,
    bayysh: findings.bayysh,
    topWcr: findings.topWcr.slice(0, 12),
    topPeople: findings.topPeople.slice(0, 8),
  }, null, 2));
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
