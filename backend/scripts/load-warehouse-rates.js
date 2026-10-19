// Загрузка расценок по складам из «Тарифы.xlsx» в wcr_warehouse_rates (migration 021).
//
//   node scripts/load-warehouse-rates.js "<файл.xlsx>"            — dry-run: отчёт, БД не меняется
//   node scripts/load-warehouse-rates.js "<файл.xlsx>" --apply   — записать
//
// Идемпотентно: существующие строки (склад, WCR, valid_from) не перезаписываются —
// отличающиеся от файла выводятся как расхождения. Конфликтные пары (склад, WCR) не грузятся.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { readRows, parseRates } = require('./lib/warehouse-rates');

const VALID_FROM = '2020-01-01'; // как у универсальных тарифов ALL — действуют на всю историю

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file) throw new Error('Укажите путь к xlsx');

  const { rates, duplicates, conflicts, errors } = parseRates(readRows(file));
  console.log(`Строк к загрузке: ${rates.length}`);
  console.log(`Полных дубликатов (схлопнуто): ${duplicates.length}`);
  duplicates.forEach((d) => console.log(`   дубль ${d.warehouse} ${d.wcr} «${d.area}» строки ${d.lines.join(',')}`));
  console.log(`Конфликтов (НЕ загружаются): ${conflicts.length}`);
  conflicts.forEach((c) => {
    console.log(`   конфликт ${c.warehouse} ${c.wcr}:`);
    c.variants.forEach((v) => console.log(`      «${v.area}» норматив=${v.norm} расценка=${v.rate} (строки ${v.lines.join(',')})`));
  });
  if (errors.length) {
    console.log(`Ошибки разбора: ${errors.length}`);
    errors.forEach((e) => console.log(`   строка ${e.line}: ${e.reason}`));
  }

  const pool = await sql.connect({
    server: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true },
  });
  try {
    const t = await pool.request().query(`SELECT OBJECT_ID('wcr_warehouse_rates','U') AS id`);
    if (!t.recordset[0].id) {
      console.log('\nТаблица wcr_warehouse_rates ещё не создана (migration 021) — проверка с БД пропущена.');
      return;
    }
    const whs = new Set((await pool.request().query(`SELECT code FROM warehouses`)).recordset.map((r) => r.code));
    const existing = new Map((await pool.request().query(
      `SELECT warehouse_code, wcr_code, area, norm_aei_per_hour, CAST(rate AS FLOAT) rate
       FROM wcr_warehouse_rates WHERE valid_from = '${VALID_FROM}'`,
    )).recordset.map((r) => [`${r.warehouse_code}|${r.wcr_code}`, r]));

    const toInsert = [];
    let same = 0;
    for (const r of rates) {
      if (!whs.has(r.warehouse)) { console.log(`   нет склада ${r.warehouse} в warehouses — пропуск ${r.wcr}`); continue; }
      const e = existing.get(`${r.warehouse}|${r.wcr}`);
      if (!e) toInsert.push(r);
      else if (e.area === r.area && Number(e.norm_aei_per_hour) === r.norm && e.rate === r.rate) same++;
      else console.log(`   РАСХОЖДЕНИЕ с БД ${r.warehouse} ${r.wcr}: БД «${e.area}» ${e.norm_aei_per_hour}/${e.rate}, файл «${r.area}» ${r.norm}/${r.rate} — не меняется`);
    }
    console.log(`\nУже в БД без изменений: ${same}; к добавлению: ${toInsert.length}`);
    if (!apply) { console.log('dry-run: БД не изменена (добавьте --apply)'); return; }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const r of toInsert) {
        await tx.request()
          .input('wh', sql.NVarChar(10), r.warehouse)
          .input('wcr', sql.NVarChar(50), r.wcr)
          .input('area', sql.NVarChar(100), r.area)
          .input('norm', sql.Decimal(9, 2), r.norm)
          .input('rate', sql.Decimal(9, 2), r.rate)
          .input('vf', sql.Date, VALID_FROM)
          .query(`INSERT INTO wcr_warehouse_rates (warehouse_code, wcr_code, area, norm_aei_per_hour, rate, valid_from)
                  VALUES (@wh, @wcr, @area, @norm, @rate, @vf)`);
      }
      await tx.commit();
      console.log(`Добавлено строк: ${toInsert.length}`);
    } catch (e) { await tx.rollback(); throw e; }
  } finally {
    await pool.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
