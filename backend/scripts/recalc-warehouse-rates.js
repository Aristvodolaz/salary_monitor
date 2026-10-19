// Предварительный расчёт / пересчёт operations.amount по расценкам складов (migration 021).
//
//   node scripts/recalc-warehouse-rates.js "<файл.xlsx>"          — ТОЛЬКО отчёт «до/после», БД не меняется
//   node scripts/recalc-warehouse-rates.js --apply [--include-closed] [--warehouse=0SK2]
//                                                                   — UPDATE из wcr_warehouse_rates
//
// Формула проекта не меняется: amount = count (АЕИ) × rate. Операции без расценки склада
// не трогаются (остаются со старым amount) и попадают в отчёт с причиной.
// «Закрытый период» — дата операции внутри периода salary_summary (там фиксируется Ккач):
// такие операции пропускаются без --include-closed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { readRows, parseRates } = require('./lib/warehouse-rates');

const CLOSED = `EXISTS (SELECT 1 FROM salary_summary ss
                 WHERE ss.user_id = o.user_id
                   AND CAST(o.operation_date AS DATE) BETWEEN ss.period_start AND ss.period_end)`;
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

async function preview(pool, file) {
  const { rates, conflicts } = parseRates(readRows(file));
  const rateOf = new Map(rates.map((r) => [`${r.warehouse}|${r.wcr}`, r]));
  const perWh = new Map();
  rates.forEach((r) => perWh.set(r.warehouse, (perWh.get(r.warehouse) ?? 0) + 1));

  const whs = (await pool.request().query(`SELECT code, name FROM warehouses WHERE code <> 'ALL' ORDER BY code`)).recordset;
  const data = (await pool.request().query(
    `SELECT x.warehouse_code wh, x.wcr_code wcr, COUNT(*) ops, SUM(x.count) aei,
            SUM(ISNULL(x.amount,0)) amt, SUM(x.closed) closed_ops
     FROM (SELECT o.warehouse_code, o.wcr_code, o.count, o.amount,
                  CASE WHEN ${CLOSED} THEN 1 ELSE 0 END AS closed
           FROM operations o) x
     GROUP BY x.warehouse_code, x.wcr_code`,
  )).recordset;

  const rows = [];
  const reasons = [];
  for (const w of [...new Set([...whs.map((x) => x.code), ...data.map((d) => d.wh)])].sort()) {
    const d = data.filter((x) => x.wh === w);
    const total = d.reduce((a, x) => a + x.amt, 0);
    let recalcOps = 0, before = 0, after = 0, closed = 0, noRateOps = 0;
    for (const x of d) {
      const r = x.wcr && rateOf.get(`${w}|${x.wcr}`);
      if (r) {
        recalcOps += x.ops; before += x.amt; after += x.aei * r.rate; closed += x.closed_ops;
      } else {
        noRateOps += x.ops;
        if (perWh.has(w)) reasons.push({ wh: w, wcr: x.wcr ?? '(пусто)', ops: x.ops, aei: x.aei, reason: x.wcr ? 'нет расценки в файле' : 'WCR не определён' });
      }
    }
    rows.push({
      wh: w, tariffs: perWh.get(w) ?? 0, recalc_ops: recalcOps, no_rate_ops: noRateOps,
      closed_ops: closed, before: money(before), after: money(after), diff: money(after - before),
      all_wh_amount: money(total),
      status: !perWh.has(w) ? 'нет тарифов в файле — не пересчитывается' : recalcOps ? 'готов к пересчёту' : 'нет операций с тарифом',
    });
  }
  console.table(rows);
  console.log('Конфликты (исключены из расчёта):', conflicts.map((c) => `${c.warehouse} ${c.wcr}`).join(', ') || '—');
  console.log('\nТоп операций без расценки на складах, где тарифы загружаются (причина — расценка отсутствует, не подставляется):');
  console.table(reasons.sort((a, b) => b.aei - a.aei).slice(0, 25));
}

async function apply(pool, includeClosed, onlyWh) {
  const t = await pool.request().query(`SELECT OBJECT_ID('wcr_warehouse_rates','U') AS id`);
  if (!t.recordset[0].id) throw new Error('Нет таблицы wcr_warehouse_rates — сначала migration 021 и load-warehouse-rates.js');
  const whs = (await pool.request().query(
    `SELECT DISTINCT warehouse_code FROM wcr_warehouse_rates WHERE is_active = 1 ${onlyWh ? `AND warehouse_code = '${onlyWh.replace(/'/g, '')}'` : ''} ORDER BY 1`,
  )).recordset.map((r) => r.warehouse_code);
  for (const w of whs) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const r = await tx.request().input('wh', sql.NVarChar(10), w).query(
        `UPDATE o SET o.amount = CAST(o.count AS FLOAT) * CAST(wr.rate AS FLOAT), o.updated_at = GETDATE()
         FROM operations o
         JOIN wcr_warehouse_rates wr ON wr.warehouse_code = o.warehouse_code AND wr.wcr_code = o.wcr_code
          AND wr.is_active = 1 AND o.operation_date >= wr.valid_from AND (wr.valid_to IS NULL OR o.operation_date <= wr.valid_to)
         WHERE o.warehouse_code = @wh
           AND (o.amount IS NULL OR ABS(o.amount - CAST(o.count AS FLOAT) * CAST(wr.rate AS FLOAT)) > 0.000001)
           ${includeClosed ? '' : `AND NOT ${CLOSED}`}`,
      );
      await tx.commit();
      console.log(`${w}: обновлено операций ${r.rowsAffected[0]}`);
    } catch (e) { await tx.rollback(); throw e; }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const pool = await sql.connect({
    server: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 300000,
  });
  try {
    if (args.includes('--apply')) {
      const wh = (args.find((a) => a.startsWith('--warehouse=')) || '').split('=')[1];
      await apply(pool, args.includes('--include-closed'), wh);
    } else {
      const file = args.find((a) => !a.startsWith('--'));
      if (!file) throw new Error('Укажите путь к xlsx');
      await preview(pool, file);
    }
  } finally {
    await pool.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
