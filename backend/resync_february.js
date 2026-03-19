/**
 * РЕСИНК ФЕВРАЛЯ 2026 — прямой запуск без HTTP/JWT
 * Использует те же тарифы и WCR-маппинг из БД (уже исправленные)
 *
 * Запуск: node resync_february.js
 * Опционально: node resync_february.js 02DQ   (только один склад)
 */

const sql  = require('mssql');
const http = require('http');
const axios = require('axios').default;

const DB_CFG = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port:   59587,
  database: 'SalaryMonitor',
  user:   'sa',
  password: 'icY2eGuyfU',
  requestTimeout: 120000,
  connectionTimeout: 60000,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const SAP_BASE = 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV';
const SAP_USER = 'SALAR_TO_PWM';
const SAP_PASS = '9pVQMGLC';

const PERIOD_START = new Date('2026-02-01T00:00:00.000Z');
const PERIOD_END   = new Date('2026-02-28T23:59:59.999Z');
const BATCH_SIZE   = 100;

// Конкретный склад из аргументов или все
const TARGET_WH = process.argv[2] || null;

const client = axios.create({
  baseURL: SAP_BASE,
  auth: { username: SAP_USER, password: SAP_PASS },
  timeout: 180_000,
  proxy: false,
  httpAgent:  new http.Agent({ keepAlive: true, maxSockets: 3 }),
  validateStatus: s => s < 500,
});

function fmt(d) { return d.toISOString().split('.')[0]; }
function log(...a)  { console.log(new Date().toISOString().slice(11,19), ...a); }
function warn(...a) { console.warn(new Date().toISOString().slice(11,19), '⚠️', ...a); }
function err(...a)  { console.error(new Date().toISOString().slice(11,19), '❌', ...a); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchSap(lgnum, start, end, attempt = 1) {
  const filter = `$filter=(Lgnum eq '${lgnum}' and (ConfirmedDate ge datetime'${fmt(start)}' and ConfirmedDate le datetime'${fmt(end)}'))`;
  const url = `/WHOSet?${filter}&$format=json`;
  try {
    const resp = await client.get(url, { timeout: 180_000 });
    if (resp.status >= 400) {
      warn(`SAP ${resp.status} для ${lgnum}`);
      return [];
    }
    return resp.data?.d?.results || [];
  } catch (e) {
    if (attempt < 3) {
      const delay = 1000 * Math.pow(2, attempt);
      warn(`Retry ${attempt}/3 ${lgnum}: ${e.message} — через ${delay}ms`);
      await sleep(delay);
      return fetchSap(lgnum, start, end, attempt + 1);
    }
    throw e;
  }
}

async function syncWarehouse(pool, wh, wcrMap, tariffMap) {
  log(`\n📦 СКЛАД ${wh.code} — начало`);
  const t0 = Date.now();

  // Загружаем userMap
  const users = await pool.request().input('wid', sql.Int, wh.id)
    .query('SELECT id, employee_id FROM users WHERE warehouse_id=@wid');
  const userMap = new Map(users.recordset.map(u => [u.employee_id, u.id]));
  log(`  👥 Пользователей: ${userMap.size}`);

  // Удаляем старые данные за февраль
  const del = await pool.request()
    .input('wc',  sql.NVarChar, wh.code)
    .input('s',   sql.DateTime, PERIOD_START)
    .input('e',   sql.DateTime, PERIOD_END)
    .query(`DELETE FROM operations
            WHERE warehouse_code=@wc AND operation_date>=@s AND operation_date<=@e`);
  log(`  🗑️  Удалено старых записей: ${del.rowsAffected[0]}`);

  // Загружаем из SAP ПОБАТЧНО (по 1 дню) — 02DQ даёт 45K записей/день
  const items = [];
  const cur = new Date(PERIOD_START);
  let dayIdx = 0;
  while (cur <= PERIOD_END) {
    const dayEnd = new Date(cur);
    dayEnd.setUTCHours(23, 59, 59, 999);
    if (dayEnd > PERIOD_END) dayEnd.setTime(PERIOD_END.getTime());
    dayIdx++;
    const dayItems = await fetchSap(wh.code, new Date(cur), dayEnd);
    if (dayItems.length > 0) {
      log(`  📡 День ${String(cur.toISOString().slice(0,10))}: ${dayItems.length} записей`);
      for (const it of dayItems) items.push(it);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
    cur.setUTCHours(0, 0, 0, 0);
  }
  log(`  📦 Итого из SAP за период: ${items.length} записей`);

  if (items.length === 0) {
    log(`  ⚡ Нет данных — пропускаем`);
    return { saved: 0, noAei: 0, noWcr: 0, noTariff: 0, noUser: 0 };
  }

  // Обрабатываем в памяти
  const ops = [];
  let noAei = 0, noWcr = 0, noTariff = 0, noUser = 0;
  const missingWcr = new Map();
  const newUsers = new Map();

  for (const item of items) {
    const aei = Math.round(parseFloat(item.ZsumAmountItm || '0'));
    if (aei <= 0) { noAei++; continue; }

    const empId = (item.Employeeid || '').trim();
    if (!empId || empId === '00000000') { noAei++; continue; }

    const wcrEntry = wcrMap.get((item.Wcr || '').trim());
    if (!wcrEntry) {
      noWcr++;
      const k = item.Wcr || 'EMPTY';
      missingWcr.set(k, (missingWcr.get(k) || 0) + 1);
      continue;
    }

    const tariff = tariffMap.get(wcrEntry.operation_type);
    if (!tariff) { noTariff++; continue; }

    const userId = userMap.get(empId);
    if (userId === undefined) {
      noUser++;
      if (!newUsers.has(empId)) {
        newUsers.set(empId, {
          fio: `${(item.McName1||'').trim()} ${(item.McName2||'').trim()}`.trim() || `Сотрудник ${empId}`,
        });
      }
      continue;
    }

    let opDate = new Date();
    const m = (item.ConfirmedDate||'').match(/\/Date\((\d+)\)\//);
    if (m) opDate = new Date(parseInt(m[1], 10));

    ops.push({
      userId,
      warehouseCode: wh.code,
      operationType:   wcrEntry.operation_type,
      participantArea: wcrEntry.participant_area,
      count:  aei,
      actdura: parseFloat(item.Actdura || '0') || null,
      operationDate: opDate,
      amount: aei * tariff.rate,  // Вn × Рm
      sapOrderId: item.Who || null,
    });
  }

  // Создаём новых пользователей
  if (newUsers.size > 0) {
    log(`  👤 Создание ${newUsers.size} новых сотрудников...`);
    for (const [empId, { fio }] of newUsers) {
      try {
        const ins = await pool.request()
          .input('e', sql.NVarChar, empId)
          .input('f', sql.NVarChar, fio)
          .input('w', sql.Int, wh.id)
          .query(`INSERT INTO users (employee_id, fio, warehouse_id, role, is_active) VALUES (@e, @f, @w, 'employee', 1)`);
        const newId = await pool.request().input('e', sql.NVarChar, empId)
          .query('SELECT id FROM users WHERE employee_id=@e');
        if (newId.recordset[0]) {
          userMap.set(empId, newId.recordset[0].id);
          log(`    ✅ ${empId} (${fio})`);
        }
      } catch (ex) {
        if (!ex.message?.includes('UNIQUE') && !ex.message?.includes('duplicate')) throw ex;
      }
    }
    // Перепробуем операции для новых юзеров
    for (const item of items) {
      const empId = (item.Employeeid || '').trim();
      if (!newUsers.has(empId)) continue;
      const aei = Math.round(parseFloat(item.ZsumAmountItm || '0'));
      if (aei <= 0) continue;
      const wcrEntry = wcrMap.get((item.Wcr || '').trim());
      if (!wcrEntry) continue;
      const tariff = tariffMap.get(wcrEntry.operation_type);
      if (!tariff) continue;
      const userId = userMap.get(empId);
      if (!userId) continue;
      let opDate = new Date();
      const mx = (item.ConfirmedDate||'').match(/\/Date\((\d+)\)\//);
      if (mx) opDate = new Date(parseInt(mx[1], 10));
      ops.push({ userId, warehouseCode: wh.code, operationType: wcrEntry.operation_type,
        participantArea: wcrEntry.participant_area, count: aei,
        actdura: parseFloat(item.Actdura||'0')||null, operationDate: opDate,
        amount: aei * tariff.rate, sapOrderId: item.Who || null });
    }
  }

  if (missingWcr.size > 0) {
    const top = [...missingWcr.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
    warn(`  Неизвестные WCR (топ-10):`, top.map(([k,v])=>`${k}=${v}`).join(', '));
  }

  // Batch INSERT
  log(`  💾 Подготовлено к сохранению: ${ops.length} операций`);
  let saved = 0;

  for (let b = 0; b < ops.length; b += BATCH_SIZE) {
    const chunk = ops.slice(b, b + BATCH_SIZE);
    const values = chunk.map(row => {
      const wc = `N'${(row.warehouseCode||'').replace(/'/g,"''")}'`;
      const ot = `N'${(row.operationType||'').replace(/'/g,"''")}'`;
      const pa = row.participantArea ? `N'${row.participantArea.replace(/'/g,"''")}'` : 'NULL';
      const ac = row.actdura != null ? row.actdura : 'NULL';
      const od = `'${row.operationDate.toISOString().slice(0,19)}'`;
      const am = row.amount != null ? row.amount : 'NULL';
      const si = row.sapOrderId ? `N'${row.sapOrderId.replace(/'/g,"''")}'` : 'NULL';
      return `(${row.userId},${wc},${ot},${pa},${row.count},${ac},${od},${am},${si})`;
    }).join(',\n        ');

    await pool.request().query(`
      MERGE operations AS target
      USING (SELECT * FROM (VALUES ${values})
        AS src(user_id,warehouse_code,operation_type,participant_area,count,actdura,operation_date,amount,sap_order_id)
      ) AS source
      ON (target.user_id=source.user_id
          AND target.operation_type=source.operation_type
          AND (target.sap_order_id=source.sap_order_id OR (target.sap_order_id IS NULL AND source.sap_order_id IS NULL)))
      WHEN MATCHED THEN
        UPDATE SET target.count=source.count, target.amount=source.amount,
                   target.actdura=source.actdura, target.updated_at=GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (user_id,warehouse_code,operation_type,participant_area,count,actdura,operation_date,amount,sap_order_id)
        VALUES (source.user_id,source.warehouse_code,source.operation_type,source.participant_area,
                source.count,source.actdura,source.operation_date,source.amount,source.sap_order_id);
    `);
    saved += chunk.length;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✅ ${wh.code}: СОХРАНЕНО=${saved} | noAEI=${noAei} noWCR=${noWcr} noTariff=${noTariff} noUser=${noUser} | ${elapsed}s`);
  return { saved, noAei, noWcr, noTariff, noUser };
}

async function main() {
  const pool = await sql.connect(DB_CFG);
  log('✅ DB подключена');

  // Загружаем справочники
  const [whs, wcrRows, tarRows] = await Promise.all([
    pool.request().query(`SELECT id, code, name FROM warehouses WHERE is_active=1 ORDER BY code`),
    pool.request().query(`SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active=1`),
    pool.request().query(`
      SELECT operation_type, rate FROM tariffs
      WHERE warehouse_code='ALL' AND is_active=1
        AND '2026-02-01' >= valid_from AND (valid_to IS NULL OR '2026-02-01' <= valid_to)
    `),
  ]);

  const wcrMap    = new Map(wcrRows.recordset.map(r => [r.wcr_code, { operation_type: r.operation_type, participant_area: r.participant_area }]));
  const tariffMap = new Map(tarRows.recordset.map(r => [r.operation_type, { rate: r.rate }]));

  log(`📚 Справочники: ${wcrMap.size} WCR, ${tariffMap.size} тарифов`);

  let warehouses = whs.recordset;
  if (TARGET_WH) {
    warehouses = warehouses.filter(w => w.code === TARGET_WH);
    if (warehouses.length === 0) {
      err(`Склад ${TARGET_WH} не найден. Доступные:`, whs.recordset.map(w=>w.code).join(', '));
      process.exit(1);
    }
  }
  log(`🏭 Складов для обработки: ${warehouses.length}`);

  const results = {};
  // Параллельно по 2 склада
  for (let i = 0; i < warehouses.length; i += 2) {
    const batch = warehouses.slice(i, i + 2);
    const batchResults = await Promise.allSettled(
      batch.map(wh => syncWarehouse(pool, wh, wcrMap, tariffMap))
    );
    batchResults.forEach((r, j) => {
      const code = batch[j].code;
      if (r.status === 'fulfilled') results[code] = r.value;
      else { err(`Склад ${code}:`, r.reason?.message); results[code] = { error: r.reason?.message }; }
    });
  }

  // Итоговая проверка Канчуриной
  log('\n=== ПРОВЕРКА КАНЧУРИНОЙ (user_id=565) ===');
  const check = await pool.request().query(`
    SELECT operation_type, participant_area,
           COUNT(*) as cnt, SUM([count]) as aei, SUM(amount) as total_amount
    FROM operations
    WHERE user_id=565
      AND operation_date >= '2026-02-01'
      AND operation_date < '2026-03-01'
    GROUP BY operation_type, participant_area
    ORDER BY total_amount DESC
  `);
  let grandTotal = 0;
  check.recordset.forEach(r => {
    grandTotal += r.total_amount;
    console.log(`  ${r.operation_type.padEnd(35)} AEI=${String(r.aei).padEnd(8)} =${r.total_amount.toFixed(2)} руб`);
  });
  console.log('');
  console.log('  ИТОГО ЗА ФЕВРАЛЬ:', grandTotal.toFixed(2), 'руб');
  console.log('  ЭТАЛОН:          59897 руб');
  const diff = Math.abs(grandTotal - 59897);
  console.log('  РАСХОЖДЕНИЕ:    ', diff < 100 ? '✅ OK (< 100 руб)' : `❌ ${diff.toFixed(2)} руб`);

  log('\n=== ИТОГ ===');
  Object.entries(results).forEach(([code, r]) => {
    if (r.error) log(`  ${code}: ❌ ${r.error}`);
    else log(`  ${code}: ✅ сохранено=${r.saved} noAEI=${r.noAei} noWCR=${r.noWcr}`);
  });

  await pool.close();
  log('Готово.');
}

main().catch(e => { err(e.message, e.stack); process.exit(1); });
