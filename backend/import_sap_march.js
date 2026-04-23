/**
 * Импорт нормативных операций из SAP за март 2026 в таблицу operations.
 * Запуск: cd backend && node import_sap_march.js
 *
 * Алгоритм:
 *  1. Загружает справочники из БД (склады, wcr_mapping, тарифы, пользователи)
 *  2. Для каждого склада удаляет старые операции за март
 *  3. Загружает записи из SAP по дням (с OData пагинацией через d.__next)
 *  4. Пишет ВСЕ сырые записи в sap_raw (без фильтрации — для аудита)
 *  5. Вычисляет amount (aeiCount × rate для приёмки/хранения, prodCount × rate для остальных)
 *  6. Вставляет записи в таблицу operations (батчами по 100)
 *
 * После импорта — запустить database/analyze_sap_raw.sql для аудита полноты данных.
 */

const sql  = require('mssql');
const axios = require('axios');

// ── Конфиг ──────────────────────────────────────────────────────────────────

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  connectionTimeout: 60000,
  requestTimeout: 300000,
  options:  { encrypt: false, trustServerCertificate: true },
};

const SAP_BASE = 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV';
const SAP_USER = 'SALAR_TO_PWM';
const SAP_PASS = '9pVQMGLC';

const START = '2026-03-01';
const END   = '2026-03-31';

// Метка импорта — уникальная для каждого запуска (склад + период).
// Позволяет в sap_raw отличить запуски друг от друга.
// Переопределите вручную если нужно перезаписать конкретный батч.
const SYNC_BATCH_PREFIX = `${START.slice(0,7)}`; // '2026-03'

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

async function ensureUsers(pool, warehouseId, unknownUsers) {
  if (unknownUsers.size === 0) return 0;
  let created = 0;
  for (const [employeeId, fio] of unknownUsers.entries()) {
    try {
      await pool.request()
        .input('employeeId', sql.NVarChar, employeeId)
        .input('fio', sql.NVarChar, fio)
        .input('warehouseId', sql.Int, warehouseId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM users WHERE employee_id = @employeeId AND warehouse_id = @warehouseId)
          BEGIN
            INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
            VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)
          END
        `);
      created++;
    } catch (_) {
      // concurrent insert or constraint conflict - safe to ignore
    }
  }
  return created;
}

/**
 * Загружает ВСЕ страницы OData для одного дня одного склада.
 * SAP возвращает d.results (текущая страница) и d.__next (URL следующей).
 * Без обхода __next теряются все записи после первой страницы (~1000 строк).
 */
async function fetchPage(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(url, {
        auth:    { username: SAP_USER, password: SAP_PASS },
        timeout: 120_000,
        proxy:   false,
        validateStatus: s => s < 600,
      });
      if (resp.status === 500) return { error500: true, data: null };
      return { error500: false, data: resp.data?.d ?? {} };
    } catch (err) {
      if (attempt === 3) { console.log(` ОШИБКА: ${err.message}`); return { error500: false, data: {} }; }
      process.stdout.write(` retry${attempt}...`);
      await sleep(2000 * attempt);
    }
  }
  return { error500: false, data: {} };
}

async function fetchSAP(warehouse, dayStart, dayEnd) {
  const filter   = `$filter=(Lgnum eq '${warehouse}' and (ConfirmedDate ge datetime'${fmtIso(dayStart)}' and ConfirmedDate le datetime'${fmtIso(dayEnd)}'))`;
  let   nextUrl  = `${SAP_BASE}/WHOSet?${filter}&$format=json`;
  const allItems = [];
  let   page     = 0;

  while (nextUrl) {
    page++;
    const { error500, data } = await fetchPage(nextUrl);
    if (error500) return { error500: true, items: [] };

    const pageItems = data?.results || [];
    for (const it of pageItems) allItems.push(it);

    // Следующая страница OData v2
    const next = data?.__next;
    if (next) {
      // __next может быть абсолютным URL — нормализуем к SAP_BASE-относительному
      if (next.startsWith('http')) {
        try {
          const u = new URL(next);
          nextUrl = SAP_BASE + u.pathname.replace(/.*\/(WHOSet.*)/, '/$1') + u.search;
        } catch { nextUrl = next; }
      } else {
        nextUrl = next.startsWith('/') ? `${SAP_BASE}${next}` : `${SAP_BASE}/${next}`;
      }
      process.stdout.write(` [стр.${page}:${pageItems.length}→`);
    } else {
      if (page > 1) process.stdout.write(`стр.${page}:${pageItems.length}]`);
      nextUrl = null;
    }
  }

  return { error500: false, items: allItems };
}

function parseItem(item) {
  const aeiCount  = Math.round(parseFloat(item.ZsumAmountItm || '0'));
  const prodCount = Math.round(parseFloat(item.ZprodWtItm   || '0'));
  if (aeiCount <= 0 && prodCount <= 0) return null;

  let employeeId = (item.Employeeid || item.Processor || '').trim();
  if (/^0+$/.test(employeeId)) {
    const fromCreated = (item.CreatedBy || '').trim();
    if (fromCreated) employeeId = fromCreated;
  }
  if (/^\d+$/.test(employeeId) && employeeId.length < 8) {
    employeeId = employeeId.padStart(8, '0');
  }
  if (!employeeId) return null;

  // ConfirmedDate приходит как /Date(timestamp)/
  let operationDate = new Date();
  if (item.ConfirmedDate) {
    const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
    if (m) operationDate = new Date(parseInt(m[1], 10));
  }

  return {
    employeeId,
    name1:    (item.McName1 || '').trim(),
    name2:    (item.McName2 || '').trim(),
    aeiCount,
    prodCount,
    actdura:  parseFloat(item.Actdura || '0'),
    operationDate,
    sapOrderId: item.Who || null,
    wcr:  (item.Wcr   || '').trim(),
    aarea: (item.Aarea || '').trim() || null,
  };
}

// MERGE батча строк в таблицу operations (идемпотентно, обходит дубли по unique index)
async function insertBatch(pool, batch) {
  if (batch.length === 0) return;

  const CHUNK = 100;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);
    const esc   = s => s != null ? `N'${String(s).replace(/'/g, "''")}'` : 'NULL';

    const values = chunk.map(r => {
      const od = `'${r.operationDate.toISOString().slice(0, 19)}'`;
      return [
        r.userId,
        esc(r.warehouseCode),
        esc(r.operationType),
        esc(r.participantArea),
        r.aeiCount,
        r.prodCount,
        r.actdura != null ? r.actdura : 'NULL',
        od,
        r.amount != null ? r.amount : 'NULL',
        r.sapOrderId ? esc(r.sapOrderId) : 'NULL',
        r.wcr      ? esc(r.wcr)      : 'NULL',
        r.aarea    ? esc(r.aarea)    : 'NULL',
      ].join(', ');
    }).map(v => `(${v})`).join(',\n        ');

    await pool.request().query(`
      MERGE operations AS target
      USING (
        SELECT * FROM (VALUES
          ${values}
        ) AS src(user_id, warehouse_code, operation_type, participant_area,
                 count, prod_count, actdura, operation_date, amount,
                 sap_order_id, wcr_code, aarea)
      ) AS source
      ON (
        target.user_id       = source.user_id
        AND target.sap_order_id  = source.sap_order_id
        AND target.operation_type = source.operation_type
        AND ISNULL(target.wcr_code, '') = ISNULL(source.wcr_code, '')
      )
      WHEN MATCHED THEN
        UPDATE SET
          target.count          = source.count,
          target.prod_count     = source.prod_count,
          target.amount         = source.amount,
          target.actdura        = source.actdura,
          target.participant_area = source.participant_area,
          target.wcr_code       = source.wcr_code,
          target.aarea          = source.aarea,
          target.updated_at     = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (user_id, warehouse_code, operation_type, participant_area,
                count, prod_count, actdura, operation_date, amount,
                sap_order_id, wcr_code, aarea)
        VALUES (source.user_id, source.warehouse_code, source.operation_type,
                source.participant_area, source.count, source.prod_count,
                source.actdura, source.operation_date, source.amount,
                source.sap_order_id, source.wcr_code, source.aarea);
    `);
  }
}

// Вставка сырых записей в sap_raw (батчами по 50 строк)
async function insertRawBatch(pool, rawRows) {
  if (rawRows.length === 0) return;

  const CHUNK = 50;
  const esc   = s => s != null ? `N'${String(s).replace(/'/g, "''")}'` : 'NULL';
  const escN  = v => v != null ? String(v) : 'NULL';
  const escB  = v => v ? '1' : '0';
  const escD  = d => d ? `'${d.toISOString().slice(0, 19)}'` : 'NULL';
  const escDate = d => d ? `'${d instanceof Date ? d.toISOString().slice(0,10) : d}'` : 'NULL';

  for (let i = 0; i < rawRows.length; i += CHUNK) {
    const chunk = rawRows.slice(i, i + CHUNK);
    const values = chunk.map(r => `(
      ${esc(r.sync_batch)},
      ${esc(r.raw_lgnum)},
      ${esc(r.raw_employee_id)},
      ${esc(r.raw_created_by)},
      ${esc(r.raw_mc_name1)},
      ${esc(r.raw_mc_name2)},
      ${esc(r.raw_wcr)},
      ${esc(r.raw_aei)},
      ${esc(r.raw_prod)},
      ${esc(r.raw_actdura)},
      ${esc(r.raw_confirmed)},
      ${esc(r.raw_who)},
      ${esc(r.raw_aarea)},
      ${esc(r.parsed_employee_id)},
      ${escN(r.parsed_aei_count)},
      ${escN(r.parsed_prod_count)},
      ${escN(r.parsed_actdura)},
      ${escD(r.parsed_date)},
      ${escB(r.parsed_skipped)},
      ${escB(r.wcr_known)},
      ${esc(r.mapped_operation_type)},
      ${esc(r.mapped_participant_area)},
      ${escB(r.mapped_has_tariff)},
      ${escN(r.mapped_rate)},
      ${escN(r.mapped_amount)},
      ${escN(r.mapped_cnt)},
      ${escB(r.user_found)},
      ${r.user_id != null ? r.user_id : 'NULL'},
      ${escDate(r.period_date)},
      ${esc(r.warehouse_code)}
    )`).join(',\n');

    await pool.request().query(`
      INSERT INTO sap_raw (
        sync_batch,
        raw_lgnum, raw_employee_id, raw_created_by, raw_mc_name1, raw_mc_name2,
        raw_wcr, raw_aei, raw_prod, raw_actdura, raw_confirmed, raw_who, raw_aarea,
        parsed_employee_id, parsed_aei_count, parsed_prod_count, parsed_actdura, parsed_date,
        parsed_skipped,
        wcr_known, mapped_operation_type, mapped_participant_area,
        mapped_has_tariff, mapped_rate, mapped_amount, mapped_cnt,
        user_found, user_id,
        period_date, warehouse_code
      ) VALUES ${values}
    `);
  }
}

// ── Главная логика ──────────────────────────────────────────────────────────

async function main() {
  console.log('🔗 Подключение к БД...');
  const pool = await sql.connect(DB);

  // 1. Загрузка справочников
  const [whRows, wcrRows, tarRows, userRows] = await Promise.all([
    pool.request().query(`SELECT id, code FROM warehouses WHERE is_active = 1 ORDER BY code`),
    pool.request().query(`SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1`),
    pool.request().query(`
      SELECT operation_type, rate
      FROM tariffs WHERE is_active = 1
      ORDER BY CASE WHEN warehouse_code = 'ALL' THEN 2 ELSE 1 END, valid_from DESC
    `),
    pool.request().query(`SELECT id, employee_id, warehouse_id FROM users WHERE is_active = 1`),
  ]);

  const wcrMap = new Map();  // wcr_code → { operation_type, participant_area }
  wcrRows.recordset.forEach(r => wcrMap.set(r.wcr_code, r));

  const tariffMap = new Map();  // operation_type → rate
  tarRows.recordset.forEach(r => {
    if (!tariffMap.has(r.operation_type)) tariffMap.set(r.operation_type, r.rate);
  });

  // users: warehouse_id → Map<employee_id, user_id>
  const usersByWh = new Map();
  userRows.recordset.forEach(r => {
    if (!usersByWh.has(r.warehouse_id)) usersByWh.set(r.warehouse_id, new Map());
    usersByWh.get(r.warehouse_id).set(r.employee_id, r.id);
  });

  const warehouses = whRows.recordset;
  const days = dayChunks(START, END);

  console.log(`   Склады: ${warehouses.map(w => w.code).join(', ')}`);
  console.log(`   WCR-кодов в маппинге: ${wcrMap.size}`);
  console.log(`   Тарифов: ${tariffMap.size}`);
  console.log(`   Период: ${START} — ${END} (${days.length} дней)\n`);

  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalUnknown  = 0;

  for (const wh of warehouses) {
    const userMap = usersByWh.get(wh.id) || new Map();
    const syncBatch = `${SYNC_BATCH_PREFIX}-${wh.code}`;
    console.log(`\n📦 Склад ${wh.code} (${userMap.size} сотрудников), batch=${syncBatch}:`);

    // Удаляем старые записи за март для этого склада
    const delRes = await pool.request()
      .input('wh', sql.NVarChar, wh.code)
      .input('s',  sql.DateTime, new Date(`${START}T00:00:00Z`))
      .input('e',  sql.DateTime, new Date(`${END}T23:59:59.999Z`))
      .query(`DELETE FROM operations WHERE warehouse_code = @wh AND operation_date >= @s AND operation_date <= @e`);
    console.log(`   🗑️  Удалено старых операций: ${delRes.rowsAffected[0]}`);

    // Удаляем старый RAW-дамп для этого batch (идемпотентность)
    const delRaw = await pool.request()
      .input('batch', sql.NVarChar, syncBatch)
      .query(`DELETE FROM sap_raw WHERE sync_batch = @batch`);
    console.log(`   🗑️  Удалено старых RAW-записей: ${delRaw.rowsAffected[0]}`);

    let whInserted = 0;
    let whRawTotal = 0;
    let consecutive500 = 0;

    for (const { s, e } of days) {
      process.stdout.write(`  ${fmtDay(s)}`);

      const { error500, items } = await fetchSAP(wh.code, s, e);

      if (error500) {
        consecutive500++;
        process.stdout.write(` → SAP 500 (пропуск)\n`);
        if (consecutive500 >= 3) {
          console.log(`   ⚠️  Склад ${wh.code} недоступен в SAP (500 на 3+ дней подряд) — пропускаем`);
          break;
        }
        continue;
      }
      consecutive500 = 0;

      process.stdout.write(` → ${items.length} записей SAP`);

      // ── Единая функция маппинга — НЕ бросает ни одну запись из SAP ──────────
      // Если WCR нет в wcrMap  → operationType = сам wcr_code, amount = 0
      // Если нет тарифа        → amount = 0
      function buildCandidate(parsed, userId) {
        const wcrEntry        = wcrMap.get(parsed.wcr);
        const operationType   = wcrEntry?.operation_type  ?? parsed.wcr;
        const participantArea = wcrEntry?.participant_area ?? '';
        const rate            = tariffMap.get(operationType) ?? 0;
        const cnt             = participantArea === 'Приемка и Хранение' ? parsed.aeiCount : parsed.prodCount;
        return {
          userId,
          warehouseCode:   wh.code,
          operationType,
          participantArea,
          aeiCount:        parsed.aeiCount,
          prodCount:       parsed.prodCount,
          actdura:         parsed.actdura,
          operationDate:   parsed.operationDate,
          amount:          cnt * rate,
          sapOrderId:      parsed.sapOrderId,
          wcr:             parsed.wcr || null,
          aarea:           parsed.aarea || null,
        };
      }

      const pendingParsed = [];  // все валидно распарсенные записи дня
      const unknownUsers  = new Map();

      for (const item of items) {
        const parsed = parseItem(item);
        if (!parsed) { totalSkipped++; continue; }

        // Диагностика неизвестных WCR (но запись НЕ пропускаем)
        if (!wcrMap.get(parsed.wcr)) totalSkipped++;

        const userId = userMap.get(parsed.employeeId);
        if (userId == null) {
          totalUnknown++;
          const fio = `${parsed.name1} ${parsed.name2}`.trim() || `Сотрудник ${parsed.employeeId}`;
          unknownUsers.set(parsed.employeeId, fio);
        }

        pendingParsed.push(parsed);
      }

      // Создаём неизвестных сотрудников перед формированием батча
      if (unknownUsers.size > 0) {
        const created = await ensureUsers(pool, wh.id, unknownUsers);
        if (created > 0) {
          const freshUsers = await pool.request()
            .input('warehouseId', sql.Int, wh.id)
            .query(`SELECT id, employee_id FROM users WHERE warehouse_id = @warehouseId`);
          userMap.clear();
          freshUsers.recordset.forEach(r => userMap.set(r.employee_id, r.id));
        }
      }

      // ── Записываем RAW-дамп в sap_raw (ВСЕ записи, включая пропущенные) ─────
      // Строим после ensureUsers/userMap refresh — чтобы user_id был корректен
      const rawRows = items.map(item => {
        const parsed = parseItem(item);
        const rawEmpId = (item.Employeeid || item.Processor || '').trim();

        // WCR маппинг
        const wcrCode    = parsed ? parsed.wcr : (item.Wcr || '').trim();
        const wcrEntry   = wcrMap.get(wcrCode);
        const opType     = wcrEntry?.operation_type  ?? wcrCode;
        const partArea   = wcrEntry?.participant_area ?? '';
        const rate       = tariffMap.get(opType) ?? null;
        const hasTariff  = rate != null;
        const aeiCnt     = parsed ? parsed.aeiCount  : Math.round(parseFloat(item.ZsumAmountItm || '0'));
        const prodCnt    = parsed ? parsed.prodCount : Math.round(parseFloat(item.ZprodWtItm   || '0'));
        const cnt        = partArea === 'Приемка и Хранение' ? aeiCnt : prodCnt;
        const amount     = hasTariff ? cnt * rate : 0;

        // Поиск пользователя (после refresh userMap)
        const empId  = parsed ? parsed.employeeId : rawEmpId;
        const userId = empId ? userMap.get(empId) : undefined;

        return {
          sync_batch:           syncBatch,
          raw_lgnum:            item.Lgnum    || null,
          raw_employee_id:      rawEmpId      || null,
          raw_created_by:       (item.CreatedBy || '').trim() || null,
          raw_mc_name1:         (item.McName1  || '').trim() || null,
          raw_mc_name2:         (item.McName2  || '').trim() || null,
          raw_wcr:              (item.Wcr      || '').trim() || null,
          raw_aei:              item.ZsumAmountItm != null ? String(item.ZsumAmountItm) : null,
          raw_prod:             item.ZprodWtItm   != null ? String(item.ZprodWtItm)   : null,
          raw_actdura:          item.Actdura != null ? String(item.Actdura) : null,
          raw_confirmed:        item.ConfirmedDate || null,
          raw_who:              item.Who     || null,
          raw_aarea:            (item.Aarea  || '').trim() || null,
          parsed_employee_id:   parsed ? parsed.employeeId : null,
          parsed_aei_count:     parsed ? parsed.aeiCount   : null,
          parsed_prod_count:    parsed ? parsed.prodCount  : null,
          parsed_actdura:       parsed ? parsed.actdura    : null,
          parsed_date:          parsed ? parsed.operationDate : null,
          parsed_skipped:       !parsed,
          wcr_known:            !!wcrEntry,
          mapped_operation_type:  opType   || null,
          mapped_participant_area: partArea || null,
          mapped_has_tariff:    hasTariff,
          mapped_rate:          hasTariff ? rate : null,
          mapped_amount:        hasTariff ? amount : null,
          mapped_cnt:           parsed ? cnt : null,
          user_found:           userId != null,
          user_id:              userId ?? null,
          period_date:          s,
          warehouse_code:       wh.code,
        };
      });

      await insertRawBatch(pool, rawRows);
      whRawTotal += rawRows.length;

      // Теперь у всех сотрудников есть userId — строим батч без потерь
      const batch = pendingParsed
        .map(parsed => {
          const userId = userMap.get(parsed.employeeId);
          if (userId == null) return null; // крайний случай: создание не удалось
          return buildCandidate(parsed, userId);
        })
        .filter(Boolean);

      const dedupMap = new Map();
      for (const row of batch) {
        const key = `${row.userId}_${row.sapOrderId || 'null'}_${row.operationType}_${row.wcr || 'null'}`;
        if (dedupMap.has(key)) {
          const existing = dedupMap.get(key);
          existing.aeiCount += row.aeiCount;
          existing.prodCount += row.prodCount;
          existing.amount += row.amount;
          existing.actdura += row.actdura;
          if (row.operationDate > existing.operationDate) {
            existing.operationDate = row.operationDate;
          }
        } else {
          dedupMap.set(key, row);
        }
      }
      const uniqueBatch = Array.from(dedupMap.values());

      await insertBatch(pool, uniqueBatch);
      whInserted    += uniqueBatch.length;
      totalInserted += uniqueBatch.length;
      process.stdout.write(`, ops: ${uniqueBatch.length}/${items.length} SAP\n`);
    }

    console.log(`   ✅ Склад ${wh.code}: operations=${whInserted}, raw=${whRawTotal}`);
  }

  await pool.close();

  console.log('\n==============================');
  console.log(`✅ Импорт завершён!`);
  console.log(`   Период: ${START} — ${END}`);
  console.log(`   Вставлено в operations: ${totalInserted.toLocaleString('ru')} операций`);
  console.log(`   Пропущено (нет WCR/тарифа): ${totalSkipped.toLocaleString('ru')}`);
  console.log(`   Неизвестных сотрудников: ${totalUnknown.toLocaleString('ru')}`);
  console.log(`\n   RAW-дамп сохранён в таблицу sap_raw.`);
  console.log(`   Для аудита запустите: database/analyze_sap_raw.sql`);
  console.log(`   Укажите @batch = '${SYNC_BATCH_PREFIX}-<КОД_СКЛАДА>'`);
  console.log('==============================');
}

main().catch(err => {
  console.error('\n❌ Ошибка:', err.message || err);
  process.exit(1);
});
