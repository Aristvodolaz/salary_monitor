/**
 * Полная выгрузка нормативных операций из SAP за март 2026.
 * Запуск: cd backend && node ../export_sap_march.js
 *
 * Результат: sap_march_export.tsv (открывается в Excel)
 */

const sql   = require('mssql');
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

// ── Конфиг ──────────────────────────────────────────────────────────────────

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

const SAP_BASE  = 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV';
const SAP_USER  = 'SALAR_TO_PWM';
const SAP_PASS  = '9pVQMGLC';

const START = '2026-03-01';
const END   = '2026-03-31';

const OUT_TSV  = path.join(__dirname, 'sap_march_export.tsv');
const OUT_JSON = path.join(__dirname, 'sap_march_raw.json');

// ── Вспомогательные функции ─────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function dayChunks(start, end) {
  const chunks = [];
  let cur = new Date(`${start}T00:00:00Z`);
  const fin = new Date(`${end}T23:59:59.999Z`);
  while (cur <= fin) {
    const chEnd = new Date(cur);
    chEnd.setUTCHours(23, 59, 59, 999);
    chunks.push({ s: new Date(cur), e: new Date(chEnd) });
    cur.setUTCDate(cur.getUTCDate() + 1);
    cur.setUTCHours(0, 0, 0, 0);
  }
  return chunks;
}

function fmtIso(d) { return d.toISOString().slice(0, 19); }
function fmtDay(d) { return d.toISOString().slice(0, 10); }

async function fetchSAP(warehouse, dayStart, dayEnd) {
  const filter = `$filter=(Lgnum eq '${warehouse}' and (ConfirmedDate ge datetime'${fmtIso(dayStart)}' and ConfirmedDate le datetime'${fmtIso(dayEnd)}'))`;
  const url    = `${SAP_BASE}/WHOSet?${filter}&$format=json`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(url, {
        auth:    { username: SAP_USER, password: SAP_PASS },
        timeout: 120_000,
        proxy:   false,
      });
      return resp.data?.d?.results || [];
    } catch (err) {
      if (attempt === 3) { console.log(` ОШИБКА: ${err.message}`); return []; }
      process.stdout.write(` retry${attempt}...`);
      await sleep(2000 * attempt);
    }
  }
  return [];
}

function parseEmployeeId(item) {
  let eid = (item.Employeeid || item.Processor || '').trim();
  if (/^0+$/.test(eid)) {
    const cb = (item.CreatedBy || '').trim();
    if (cb) eid = cb;
  }
  if (/^\d+$/.test(eid) && eid.length < 8) eid = eid.padStart(8, '0');
  return eid || null;
}

// ── Главная логика ──────────────────────────────────────────────────────────

async function main() {
  // 1. Подключение к БД и загрузка справочников
  console.log('🔗 Подключение к БД...');
  const pool = await sql.connect(DB);

  const [whRows, normRows, pickRows, mapRows, tarRows, userRows] = await Promise.all([
    pool.request().query(`SELECT code FROM warehouses WHERE is_active = 1 ORDER BY code`),
    pool.request().query(`SELECT wcr_code FROM wcr_norms WHERE is_active = 1`),
    pool.request().query(`SELECT wcr_code, rate, norm_label, description_new FROM wcr_picking_norms WHERE is_active = 1`),
    pool.request().query(`SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1`),
    pool.request().query(`
      SELECT operation_type, rate, norm_aei_per_hour, warehouse_code
      FROM tariffs WHERE is_active = 1
      ORDER BY CASE WHEN warehouse_code = 'ALL' THEN 2 ELSE 1 END, valid_from DESC
    `),
    pool.request().query(`SELECT employee_id, fio FROM users WHERE is_active = 1 AND employee_id != '00000000'`),
  ]);

  await pool.close();

  const warehouses  = whRows.recordset.map(r => r.code);
  const wcrNormsSet = new Set(normRows.recordset.map(r => r.wcr_code));

  const pickingMap = new Map(); // wcr_code → { rate, norm_label, description_new }
  pickRows.recordset.forEach(r => pickingMap.set(r.wcr_code, r));

  const wcrMap = new Map(); // wcr_code → { operation_type, participant_area }
  mapRows.recordset.forEach(r => wcrMap.set(r.wcr_code, r));

  const tariffMap = new Map(); // operation_type → { rate, norm_aei_per_hour }
  tarRows.recordset.forEach(r => { if (!tariffMap.has(r.operation_type)) tariffMap.set(r.operation_type, r); });

  const userFioMap = new Map(); // employee_id → fio
  userRows.recordset.forEach(r => userFioMap.set(r.employee_id, r.fio));

  const normsWcrSet = new Set([...wcrNormsSet, ...pickingMap.keys()]);

  console.log(`   Склады: ${warehouses.join(', ')}`);
  console.log(`   Нормативных WCR-кодов: ${normsWcrSet.size} (АЕИ=${wcrNormsSet.size}, компл=${pickingMap.size})`);
  console.log(`   Тарифов: ${tariffMap.size}, сотрудников в БД: ${userFioMap.size}`);

  // 2. Получение данных из SAP
  const days      = dayChunks(START, END);
  const rawItems  = []; // все сырые записи (для JSON)

  let totalSap   = 0;
  let totalSkip  = 0;

  // Агрегат: "employee_id|wcr_code" → строка результата
  const agg = new Map();

  for (const wh of warehouses) {
    console.log(`\n📦 Склад ${wh} (${days.length} дней):`);

    for (let i = 0; i < days.length; i++) {
      const { s, e } = days[i];
      process.stdout.write(`  ${fmtDay(s)}`);

      const items = await fetchSAP(wh, s, e);
      totalSap += items.length;
      process.stdout.write(` → ${items.length} записей\n`);

      for (const item of items) {
        const aeiCount  = Math.round(parseFloat(item.ZsumAmountItm || '0'));
        const prodCount = Math.round(parseFloat(item.ZprodWtItm   || '0'));
        if (aeiCount <= 0 && prodCount <= 0) { totalSkip++; continue; }

        const wcr = (item.Wcr || '').trim();
        if (!normsWcrSet.has(wcr)) { totalSkip++; continue; }

        const eid = parseEmployeeId(item);
        if (!eid) { totalSkip++; continue; }

        rawItems.push({
          warehouse: wh, date: fmtDay(s),
          employeeId: eid, wcr, aeiCount, prodCount,
          name1: (item.McName1 || '').trim(),
          name2: (item.McName2 || '').trim(),
        });

        const wcrEntry = wcrMap.get(wcr);
        const participantArea = wcrEntry?.participant_area ?? '';
        const operationType   = wcrEntry?.operation_type  ?? wcr;

        // ── ИСПРАВЛЕННАЯ формула: приёмка/хранение → aeiCount; комплектация → prodCount ──
        const isHranenie = participantArea === 'Приемка и Хранение';
        const cnt = isHranenie ? aeiCount : prodCount;

        let block = 'Комплектация';
        let rate  = null;
        let description = wcr;
        let normLabel   = '';
        let amount      = 0;

        if (wcrNormsSet.has(wcr)) {
          // Блок 1: АЕИ
          block       = 'АЕИ';
          const tar   = tariffMap.get(operationType);
          rate        = tar?.rate ?? null;
          description = wcrEntry ? operationType : wcr;
          normLabel   = wcrEntry ? participantArea : wcr;
          amount      = cnt * (rate ?? 0);
        } else if (pickingMap.has(wcr)) {
          // Блок 2: Комплектация
          const pk = pickingMap.get(wcr);
          rate        = pk.rate;
          description = pk.description_new;
          normLabel   = pk.norm_label;
          amount      = cnt * (rate ?? 0);
        }

        const fio = userFioMap.get(eid)
          ?? `${item.McName1 || ''} ${item.McName2 || ''}`.trim()
          ?? eid;

        const key = `${eid}|${wcr}`;
        const existing = agg.get(key);
        if (existing) {
          existing.cnt    += cnt;
          existing.amount += amount;
        } else {
          agg.set(key, { block, wcr_code: wcr, employee_id: eid, fio, description, norm_label: normLabel, rate, cnt, amount });
        }
      }
    }
  }

  // 3. Сохранение сырых данных в JSON (для отладки)
  fs.writeFileSync(OUT_JSON, JSON.stringify(rawItems, null, 2), 'utf8');
  console.log(`\n💾 Сырые данные SAP → ${OUT_JSON} (${rawItems.length} записей)`);

  // 4. Формирование и сохранение TSV
  const rows = Array.from(agg.values()).sort((a, b) =>
    a.fio.localeCompare(b.fio, 'ru') ||
    (a.block === 'АЕИ' ? 1 : -1) - (b.block === 'АЕИ' ? 1 : -1) ||
    a.wcr_code.localeCompare(b.wcr_code),
  );

  const SEP = '\t';
  const BOM = '\uFEFF';
  const header = ['Блок', 'WCR', 'ФИО', 'ШК', 'Кол-во', 'Описание', 'Тип/Участок', 'Ставка', 'Сумма'].join(SEP);
  const lines  = rows.map(r => [
    r.block,
    r.wcr_code,
    r.fio,
    r.employee_id,
    r.cnt,
    r.description,
    r.norm_label,
    r.rate != null ? String(r.rate).replace('.', ',') : '',
    Math.round(r.amount * 100) / 100,
  ].join(SEP));

  fs.writeFileSync(OUT_TSV, BOM + [header, ...lines].join('\n'), 'utf8');

  // 5. Итог
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  console.log(`\n✅ Готово!`);
  console.log(`   Период: ${START} — ${END}`);
  console.log(`   Получено из SAP: ${totalSap.toLocaleString('ru')} записей`);
  console.log(`   Пропущено: ${totalSkip.toLocaleString('ru')}`);
  console.log(`   Уникальных строк (сотрудник × WCR): ${rows.length}`);
  console.log(`   Итого сумма: ${Math.round(totalAmount).toLocaleString('ru')} ₽`);
  console.log(`   📄 TSV: ${OUT_TSV}`);
  console.log(`   📋 JSON: ${OUT_JSON}`);
}

main().catch(err => {
  console.error('\n❌ Ошибка:', err.message || err);
  process.exit(1);
});
