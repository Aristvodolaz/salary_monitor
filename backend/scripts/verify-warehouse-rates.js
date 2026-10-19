// Read-only проверка migration 021 / wcr_warehouse_rates:
//   node scripts/verify-warehouse-rates.js "<файл.xlsx>"
// Ничего не пишет в БД.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { readRows, parseRates } = require('./lib/warehouse-rates');

const OLD_VIEW_AMOUNT = `
  SELECT o.id, o.warehouse_code,
    CASE WHEN wp.wcr_code IS NOT NULL THEN CAST(ISNULL(o.count,0) AS FLOAT) * ISNULL(wp.rate,0)
         WHEN wm.wcr_code IS NOT NULL AND t.rate IS NOT NULL THEN CAST(ISNULL(o.count,0) AS FLOAT) * t.rate
         ELSE 0 END AS old_amount
  FROM operations o
  INNER JOIN users u ON o.user_id = u.id
  INNER JOIN warehouses w ON o.warehouse_code = w.code
  LEFT JOIN wcr_mapping wm ON wm.wcr_code = o.wcr_code AND wm.is_active = 1
  LEFT JOIN tariffs t ON (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND wm.operation_type = t.operation_type AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to) AND t.is_active = 1
  LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code AND wp.is_active = 1
  WHERE u.is_active = 1`;

let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) failed++;
};

async function main() {
  const file = process.argv[2];
  const { rates } = parseRates(readRows(file));
  const pool = await sql.connect({
    server: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 300000,
  });
  const q = async (s) => (await pool.request().query(s)).recordset;
  try {
    // 1. Содержимое таблицы == файл
    const db = await q(`SELECT warehouse_code w, wcr_code c, area, CAST(norm_aei_per_hour AS FLOAT) norm, CAST(rate AS FLOAT) rate FROM wcr_warehouse_rates WHERE is_active=1`);
    const dbMap = new Map(db.map((r) => [`${r.w}|${r.c}`, r]));
    check('кол-во строк БД == файл', db.length === rates.length, `${db.length} / ${rates.length}`);
    const bad = rates.filter((r) => {
      const d = dbMap.get(`${r.warehouse}|${r.wcr}`);
      return !d || d.area !== r.area || d.norm !== r.norm || d.rate !== r.rate;
    });
    check('нормативы, расценки и участки совпадают с файлом', bad.length === 0, bad.slice(0, 3).map((b) => `${b.warehouse} ${b.wcr}`).join(','));
    const wrongWh = db.filter((r) => !['0SK1', '0SK2', '0SK5', '0SK6'].includes(r.w));
    check('тарифы только у 4 складов из файла', wrongWh.length === 0);

    // 2. 18 складов, регистр и ведущие нули
    const want = '01SS 02DQ 02SR 0DM3 0KRA 0SK1 0SK2 0SK4 0SK5 0SK6 0SK9 0SKA RCDM RR02 RR03 RR04 RR05 RR11'.split(' ');
    const have = new Set((await q(`SELECT code FROM warehouses`)).map((r) => r.code));
    check('все 18 складов есть', want.every((c) => have.has(c)), want.filter((c) => !have.has(c)).join(','));
    const dupWh = await q(`SELECT code FROM warehouses GROUP BY code HAVING COUNT(*)>1`);
    check('дублей складов нет', dupWh.length === 0);

    // 3. Старые тарифы не тронуты
    const t = await q(`SELECT COUNT(*) n, SUM(CASE WHEN warehouse_code='ALL' THEN 1 ELSE 0 END) allw FROM tariffs`);
    check('tariffs не изменены (108 строк ALL)', t[0].n === 108 && t[0].allw === 108, JSON.stringify(t[0]));

    // 4. Нет фан-аута: число строк view == число строк по старой формуле
    const nOld = (await q(`SELECT COUNT(*) n FROM (${OLD_VIEW_AMOUNT}) x`))[0].n;
    const nNew = (await q(`SELECT COUNT(*) n FROM v_salary_details`))[0].n;
    check('v_salary_details без задвоения строк', nOld === nNew, `${nOld} → ${nNew}`);

    // 5. Изоляция: суммы вьюхи == старой формуле везде, кроме операций с расценкой склада
    const cmp = await q(`
      SELECT n.warehouse_code w, COUNT(*) ops,
             SUM(CASE WHEN ABS(n.base_amount - x.old_amount) > 0.000001 THEN 1 ELSE 0 END) changed,
             SUM(CASE WHEN ABS(n.base_amount - x.old_amount) > 0.000001 AND wr.id IS NULL THEN 1 ELSE 0 END) changed_without_rate
      FROM v_salary_details n
      JOIN (${OLD_VIEW_AMOUNT}) x ON x.id = n.operation_id
      JOIN operations o ON o.id = n.operation_id
      LEFT JOIN wcr_warehouse_rates wr ON wr.warehouse_code = o.warehouse_code AND wr.wcr_code = o.wcr_code
        AND wr.is_active = 1 AND o.operation_date >= wr.valid_from AND (wr.valid_to IS NULL OR o.operation_date <= wr.valid_to)
      GROUP BY n.warehouse_code ORDER BY 1`);
    console.table(cmp);
    check('суммы изменились только там, где есть расценка склада', cmp.every((r) => r.changed_without_rate === 0));
    check('склады без тарифов (14 шт.) не изменились', cmp.filter((r) => !['0SK1', '0SK2', '0SK5', '0SK6'].includes(r.w)).every((r) => r.changed === 0));

    // 6. Точность: сумма вьюхи == count × rate
    const prec = await q(`
      SELECT COUNT(*) n FROM v_salary_details n JOIN operations o ON o.id = n.operation_id
      JOIN wcr_warehouse_rates wr ON wr.warehouse_code = o.warehouse_code AND wr.wcr_code = o.wcr_code AND wr.is_active = 1
        AND o.operation_date >= wr.valid_from AND (wr.valid_to IS NULL OR o.operation_date <= wr.valid_to)
      WHERE ABS(n.base_amount - CAST(o.count AS FLOAT) * CAST(wr.rate AS FLOAT)) > 0.000001`);
    check('base_amount == count × rate для строк с расценкой склада', prec[0].n === 0, `расхождений ${prec[0].n}`);

    // 7. Одинаковый WCR на разных складах -> разные ставки, не смешиваются
    const multi = await q(`SELECT wcr_code, COUNT(DISTINCT warehouse_code) whs, COUNT(DISTINCT rate) rates FROM wcr_warehouse_rates GROUP BY wcr_code HAVING COUNT(DISTINCT warehouse_code) > 1 AND COUNT(DISTINCT rate) > 1`);
    check('WCR с разными ставками на разных складах присутствуют', multi.length > 0, `${multi.length} кодов (напр. ${multi.slice(0, 3).map((m) => m.wcr_code)})`);
    const sample = await q(`SELECT TOP 1 o.warehouse_code, o.wcr_code, v.rate FROM v_salary_details v JOIN operations o ON o.id=v.operation_id WHERE o.wcr_code='PMS1' AND o.warehouse_code IN ('0SK5','0SK6') GROUP BY o.warehouse_code,o.wcr_code,v.rate`);
    const s2 = await q(`SELECT o.warehouse_code w, MIN(v.rate) mn, MAX(v.rate) mx FROM v_salary_details v JOIN operations o ON o.id=v.operation_id WHERE o.wcr_code='PMS1' AND o.warehouse_code IN ('0SK5','0SK6') GROUP BY o.warehouse_code`);
    console.table(s2);
    const exp = { '0SK5': 2.73, '0SK6': 4.05 };
    check('PMS1: 0SK5=2.73, 0SK6=4.05 (изоляция складов)', s2.every((r) => r.mn === exp[r.w] && r.mx === exp[r.w]));

    // 8. Другие вьюхи и запросы приложения исполняются
    for (const v of ['v_salary_by_day', 'v_salary_by_month', 'v_top_performers', 'v_operations_stats']) {
      try { const r = await q(`SELECT COUNT(*) n FROM ${v}`); check(`${v} исполняется`, true, `${r[0].n} строк`); }
      catch (e) { check(`${v} исполняется`, false, e.message); }
    }
    const wh = await q(`SELECT TOP 1 id FROM warehouses WHERE code='0SK5'`);
    try {
      const r = await pool.request().input('warehouseId', sql.Int, wh[0].id)
        .input('startDate', sql.VarChar, '2026-09-01').input('endDate', sql.VarChar, '2026-09-30')
        .query(`SELECT u.id, SUM(CASE WHEN wp.wcr_code IS NOT NULL AND COALESCE(wr.rate, wp.rate) IS NOT NULL THEN ISNULL(o.count,0)*COALESCE(wr.rate, wp.rate) ELSE 0 END) amt
                FROM operations o INNER JOIN users u ON o.user_id=u.id
                LEFT JOIN wcr_picking_norms wp ON wp.wcr_code=o.wcr_code AND wp.is_active=1
                LEFT JOIN wcr_warehouse_rates wr ON wr.warehouse_code=o.warehouse_code AND wr.wcr_code=o.wcr_code AND wr.is_active=1
                  AND o.operation_date>=wr.valid_from AND (wr.valid_to IS NULL OR o.operation_date<=wr.valid_to)
                WHERE u.warehouse_id=@warehouseId AND o.operation_date>=@startDate AND o.operation_date<DATEADD(DAY,1,CAST(@endDate AS DATE))
                GROUP BY u.id`);
      check('запрос страницы нормативов (norms.service) исполняется', true, `${r.recordset.length} сотрудников`);
    } catch (e) { check('запрос страницы нормативов исполняется', false, e.message); }

    // 9. Идемпотентность пересчёта: повторный --apply ничего не изменит
    const pending = await q(`SELECT COUNT(*) n FROM operations o JOIN wcr_warehouse_rates wr ON wr.warehouse_code=o.warehouse_code AND wr.wcr_code=o.wcr_code AND wr.is_active=1
      AND o.operation_date>=wr.valid_from AND (wr.valid_to IS NULL OR o.operation_date<=wr.valid_to)
      WHERE o.amount IS NULL OR ABS(o.amount - CAST(o.count AS FLOAT)*CAST(wr.rate AS FLOAT)) > 0.000001`);
    console.log(`INFO операций, где хранимый amount ещё отличается от расценки склада: ${pending[0].n} (пересчёт не применялся)`);
  } finally {
    await pool.close();
  }
  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки пройдены');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
