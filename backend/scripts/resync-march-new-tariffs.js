/**
 * ═══════════════════════════════════════════════════════════════
 *  ПЕРЕСИНХРОНИЗАЦИЯ МАРТА 2026 С НОВЫМИ ТАРИФАМИ
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Закрывает старые тарифы (valid_to = 2026-02-28)
 *  2. Создаёт новые тарифы с valid_from = 2026-03-01
 *  3. Удаляет операции за март
 *  4. Загружает данные из SAP и пересчитывает amount по новым тарифам
 */

const axios = require('axios');
const sql   = require('mssql');
const path  = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ─── Конфиг ────────────────────────────────────────────────────
const dbConfig = {
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server:   process.env.DB_HOST     || 'PRM-SRV-MSSQL-01.komus.net',
  port:     parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME     || 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

const axiosInstance = axios.create({
  baseURL:  process.env.SAP_ODATA_BASE_URL,
  auth:     { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout:  180000,
  proxy:    false,
});

const PERIOD_START = new Date(Date.UTC(2026, 2, 1));                    // 2026-03-01
const PERIOD_END   = new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999)); // 2026-03-31
const CHUNK_DAYS   = 5;
const MAX_RETRIES  = 3;

// ─── Новые тарифы с марта 2026 ─────────────────────────────────
// operation_type (с подчёркиванием, как в БД) → { rate, norm }
const MARCH_TARIFFS = [
  { op: 'М2_Коробочная комплектация',  rate: 15.3, norm: 23  },
  { op: 'М2_Штучн.компл.однострочн',   rate: 2.0,  norm: 180 },
  { op: 'М2_Штучная комплектация',      rate: 1.4,  norm: 250 },
  { op: 'М2_Упаковка',                  rate: 1.4,  norm: 250 },
  { op: 'М3_Коробочная комплектация',  rate: 5.4,  norm: 65  },
  { op: 'М3_Штучн.компл.однострочн',   rate: 10.4, norm: 34  },
  { op: 'М3_Штучная комплектация',      rate: 6.8,  norm: 52  },
  { op: 'М3_Упаковка',                  rate: 0,    norm: null },
  { op: 'М4_Коробочная комплектация',  rate: 5.4,  norm: 65  },
  { op: 'М4_Штучн.компл.однострочн',   rate: 2.4,  norm: 150 },
  { op: 'М4_Штучная комплектация',      rate: 1.4,  norm: 245 },
  { op: 'М4_Упаковка',                  rate: 1.5,  norm: 240 },
  { op: 'М5_Коробочная комплектация',  rate: 5.4,  norm: 65  },
  { op: 'М5_Штучн.компл.однострочн',   rate: 1.4,  norm: 260 },
  { op: 'М5_Штучная комплектация',      rate: 1.1,  norm: 320 },
  { op: 'М5_Упаковка',                  rate: 1.2,  norm: 300 },
  { op: 'МС_Коробочная комплектация',  rate: 5.4,  norm: 65  },
  { op: 'МС_Штучн.компл.однострочн',   rate: 3.2,  norm: 110 },
  { op: 'МС_Штучная комплектация',      rate: 1.6,  norm: 225 },
  { op: 'МС_Упаковка',                  rate: 1.7,  norm: 210 },
  { op: 'ДО_Коробочная комплектация',  rate: 7.1,  norm: 50  },
  { op: 'ДО_Штучная комплектация',      rate: 0,    norm: null },
  { op: 'ФС_Коробочная комплектация',  rate: 5.9,  norm: 60  },
  { op: 'ФС_Штучная комплектация',      rate: 2.8,  norm: 125 },
  { op: 'ПМ_Упаковка',                  rate: 4.1,  norm: 87  },
];

// ─── Вспомогательные ───────────────────────────────────────────
function fmtDate(d)  { return d.toISOString().split('.')[0]; }
function fmtShort(d) { return d.toISOString().slice(0, 10); }
function sleep(ms)   { return new Promise(r => setTimeout(r, ms)); }

function getDateChunks(start, end, days) {
  const chunks = [];
  let cur = new Date(start);
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + days - 1);
    chunkEnd.setUTCHours(23, 59, 59, 999);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ start: new Date(cur), end: new Date(chunkEnd) });
    cur = new Date(chunkEnd.getTime() + 1);
    cur.setUTCHours(0, 0, 0, 0);
  }
  return chunks;
}

async function fetchWithRetry(url, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axiosInstance.get(url);
      return resp.data?.d?.results || [];
    } catch (err) {
      const msg = err.message || err.code || 'unknown';
      if (attempt === MAX_RETRIES) {
        console.error(`   FAIL ${label}: ПРОВАЛЕНО после ${MAX_RETRIES} попыток — ${msg}`);
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      console.warn(`   WARN ${label}: ${msg} — retry ${attempt}/${MAX_RETRIES} через ${delay}ms`);
      await sleep(delay);
    }
  }
}

// ─── ОСНОВНОЙ СКРИПТ ──────────────────────────────────────────
async function main() {
  console.log('================================================================');
  console.log('  ПЕРЕСИНХРОНИЗАЦИЯ МАРТА 2026 С НОВЫМИ ТАРИФАМИ');
  console.log('  Период: 2026-03-01 — 2026-03-31');
  console.log('================================================================\n');

  const pool = await sql.connect(dbConfig);
  console.log('Подключено к БД\n');

  // ─── ШАГ 1. ОБНОВЛЕНИЕ ТАРИФОВ ─────────────────────────────
  console.log('=== ШАГ 1. ОБНОВЛЕНИЕ ТАРИФОВ ===\n');

  // 1a. Закрываем старые тарифы — ставим valid_to = 2026-02-28
  const closeRes = await pool.request().query(`
    UPDATE tariffs
    SET valid_to = '2026-02-28'
    WHERE is_active = 1
      AND valid_to IS NULL
      AND valid_from < '2026-03-01'
  `);
  console.log(`   Закрыто старых тарифов (valid_to=2026-02-28): ${closeRes.rowsAffected[0]}`);

  // 1b. Удаляем мартовские тарифы если были (идемпотентность)
  const delTarRes = await pool.request().query(`
    DELETE FROM tariffs WHERE valid_from = '2026-03-01'
  `);
  if (delTarRes.rowsAffected[0] > 0) {
    console.log(`   Удалены предыдущие мартовские тарифы: ${delTarRes.rowsAffected[0]}`);
  }

  // 1c. Вставляем новые тарифы
  for (const t of MARCH_TARIFFS) {
    await pool.request()
      .input('wh', sql.VarChar(20), 'ALL')
      .input('op', sql.NVarChar(100), t.op)
      .input('rate', sql.Decimal(10, 2), t.rate)
      .input('norm', sql.Decimal(10, 2), t.norm)
      .input('vf', sql.Date, '2026-03-01')
      .query(`
        INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, is_active, valid_from, valid_to)
        VALUES (@wh, @op, @rate, @norm, 1, @vf, NULL)
      `);
  }
  console.log(`   Добавлено новых тарифов с 2026-03-01: ${MARCH_TARIFFS.length}`);

  // Выводим сравнение
  console.log('\n   Сравнение тарифов (февраль → март):');
  const allTariffs = await pool.request().query(`
    SELECT operation_type, rate, valid_from
    FROM tariffs
    WHERE is_active = 1
    ORDER BY operation_type, valid_from
  `);
  const tarByOp = {};
  for (const t of allTariffs.recordset) {
    const key = t.operation_type;
    if (!tarByOp[key]) tarByOp[key] = {};
    if (new Date(t.valid_from) < new Date('2026-03-01')) {
      tarByOp[key].feb = parseFloat(t.rate);
    } else {
      tarByOp[key].mar = parseFloat(t.rate);
    }
  }
  for (const [op, v] of Object.entries(tarByOp).sort()) {
    const feb = v.feb != null ? v.feb : '—';
    const mar = v.mar != null ? v.mar : '—';
    const changed = (v.feb != null && v.mar != null && v.feb !== v.mar) ? ' <--' : '';
    console.log(`   ${op.padEnd(40)} ${String(feb).padStart(6)} → ${String(mar).padStart(6)}${changed}`);
  }

  // ─── ШАГ 2. ЗАГРУЗКА КОНТЕКСТА ─────────────────────────────
  console.log('\n=== ШАГ 2. ЗАГРУЗКА КОНТЕКСТА ===\n');

  const warehouseRes = await pool.request().query(
    `SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY code`
  );
  const warehouses = warehouseRes.recordset;
  console.log(`   Активных складов: ${warehouses.length}`);
  const warehouseIdMap = new Map(warehouses.map(w => [w.code, w.id]));

  const wcrRes = await pool.request().query(
    `SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1`
  );
  const wcrMap = new Map(
    wcrRes.recordset.map(r => [r.wcr_code, { opType: r.operation_type, area: r.participant_area }])
  );
  console.log(`   WCR-маппингов: ${wcrMap.size}`);

  // Тарифы для марта 2026
  const tariffRes = await pool.request().query(`
    SELECT operation_type, rate, norm_aei_per_hour, warehouse_code
    FROM tariffs
    WHERE is_active = 1
      AND valid_from <= '2026-03-31'
      AND (valid_to IS NULL OR valid_to >= '2026-03-01')
    ORDER BY CASE WHEN warehouse_code != 'ALL' THEN 1 ELSE 2 END, valid_from DESC
  `);
  const tariffMap = new Map();
  for (const t of tariffRes.recordset) {
    if (!tariffMap.has(t.operation_type)) {
      tariffMap.set(t.operation_type, parseFloat(t.rate));
    }
  }
  console.log(`   Тарифов (март): ${tariffMap.size}`);
  for (const [op, rate] of tariffMap) {
    console.log(`     ${op.padEnd(40)} ${rate}`);
  }

  const usersRes = await pool.request().query(
    `SELECT id, employee_id, warehouse_id FROM users`
  );
  const userMap = new Map(usersRes.recordset.map(u => [u.employee_id, u.id]));
  console.log(`   Пользователей: ${userMap.size}\n`);

  // ─── ШАГ 3. ОЧИСТКА СТАРЫХ ДАННЫХ ЗА МАРТ ──────────────────
  console.log('=== ШАГ 3. ОЧИСТКА ДАННЫХ ЗА МАРТ ===\n');
  const delRes = await pool.request().query(`
    DELETE FROM operations
    WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
  `);
  console.log(`   Удалено записей за март: ${delRes.rowsAffected[0]}\n`);

  // ─── ШАГ 4. ЗАГРУЗКА ИЗ SAP ────────────────────────────────
  console.log('=== ШАГ 4. ЗАГРУЗКА ИЗ SAP ===\n');
  const chunks = getDateChunks(PERIOD_START, PERIOD_END, CHUNK_DAYS);
  console.log(`   Чанков по ${CHUNK_DAYS} дней: ${chunks.length}\n`);

  let totalFromSap     = 0;
  let totalSaved       = 0;
  let totalSkippedAei  = 0;
  let totalSkippedWcr  = 0;
  let totalSkippedTar  = 0;
  let totalNewUsers    = 0;
  let totalErrors      = 0;

  const missingWcrs    = new Map();
  const missingTariffs = new Map();
  const warehouseStats = new Map();

  for (const wh of warehouses) {
    const whStats = { fetched: 0, saved: 0, skippedAei: 0, skippedWcr: 0, skippedTariff: 0, errors: 0 };

    console.log(`\n  -- Склад: ${wh.code} (${wh.name}) --`);

    let allItems = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const c = chunks[ci];
      const filter = `$filter=(Lgnum eq '${wh.code}' and (ConfirmedDate ge datetime'${fmtDate(c.start)}' and ConfirmedDate le datetime'${fmtDate(c.end)}'))`;
      const url = `/WHOSet?${filter}&$format=json`;
      const label = `${wh.code} чанк ${ci + 1}/${chunks.length} [${fmtShort(c.start)}—${fmtShort(c.end)}]`;

      try {
        const items = await fetchWithRetry(url, label);
        console.log(`     ${label} -> ${items.length} записей`);
        allItems = allItems.concat(items);
      } catch (err) {
        console.error(`     ${label}: ПРОПУЩЕН (${err.message})`);
        whStats.errors++;
        totalErrors++;
      }
    }

    whStats.fetched = allItems.length;
    totalFromSap += allItems.length;
    console.log(`     Всего из SAP: ${allItems.length}`);

    if (allItems.length === 0) {
      console.log(`     Пропускаем (нет данных)`);
      warehouseStats.set(wh.code, whStats);
      continue;
    }

    const batch = [];

    for (const item of allItems) {
      const aeiRaw   = parseFloat(item.ZsumAmountItm || '0');
      const aeiCount = Math.round(aeiRaw);
      if (aeiCount <= 0) { whStats.skippedAei++; totalSkippedAei++; continue; }

      const employeeId = (item.Employeeid || item.Processor || '').trim();
      if (!employeeId) { whStats.skippedAei++; totalSkippedAei++; continue; }

      const wcr      = (item.Wcr || '').trim();
      const wcrEntry = wcrMap.get(wcr);
      if (!wcrEntry) {
        whStats.skippedWcr++;
        totalSkippedWcr++;
        missingWcrs.set(wcr, (missingWcrs.get(wcr) || 0) + 1);
        continue;
      }

      const rate = tariffMap.get(wcrEntry.opType);
      if (rate == null) {
        whStats.skippedTariff++;
        totalSkippedTar++;
        missingTariffs.set(wcrEntry.opType, (missingTariffs.get(wcrEntry.opType) || 0) + 1);
        continue;
      }

      let operationDate = new Date();
      if (item.ConfirmedDate) {
        const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
        if (m) operationDate = new Date(parseInt(m[1], 10));
      }

      let userId = userMap.get(employeeId);
      if (userId === undefined) {
        const fio = `${(item.McName1 || '').trim()} ${(item.McName2 || '').trim()}`.trim()
          || `Сотрудник ${employeeId}`;
        const whId = warehouseIdMap.get(wh.code);
        if (!whId) { whStats.errors++; continue; }

        try {
          const ins = await pool.request()
            .input('eid', sql.VarChar(50), employeeId)
            .input('fio', sql.NVarChar(200), fio)
            .input('wid', sql.Int, whId)
            .query(`
              INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
              OUTPUT INSERTED.id
              VALUES (@eid, @fio, @wid, 'employee', 1)
            `);
          userId = ins.recordset[0].id;
          userMap.set(employeeId, userId);
          totalNewUsers++;
          if (totalNewUsers <= 5) {
            console.log(`     Новый пользователь: ${employeeId} (${fio}) -> id=${userId}`);
          }
        } catch (err) {
          if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate')) {
            const re = await pool.request()
              .input('eid', sql.VarChar(50), employeeId)
              .query(`SELECT id FROM users WHERE employee_id = @eid`);
            if (re.recordset.length > 0) {
              userId = re.recordset[0].id;
              userMap.set(employeeId, userId);
            } else { whStats.errors++; continue; }
          } else { whStats.errors++; totalErrors++; continue; }
        }
      }

      const actdura = parseFloat(item.Actdura || '0');
      const amount  = aeiCount * rate;

      batch.push({
        userId,
        warehouseCode: wh.code,
        operationType: wcrEntry.opType,
        participantArea: wcrEntry.area || null,
        count: aeiCount,
        actdura,
        operationDate,
        amount,
        sapOrderId: item.Who || null,
        wcrCode: wcr,
        aarea: (item.Aarea || '').trim() || null,
      });
    }

    // Bulk INSERT батчами по 100
    const BATCH_SIZE = 100;
    let batchSaved = 0;

    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk  = batch.slice(i, i + BATCH_SIZE);
      const values = chunk.map(row => {
        const uid = row.userId;
        const wc  = `N'${row.warehouseCode.replace(/'/g, "''")}'`;
        const ot  = `N'${row.operationType.replace(/'/g, "''")}'`;
        const pa  = row.participantArea ? `N'${row.participantArea.replace(/'/g, "''")}'` : 'NULL';
        const cnt = row.count;
        const act = row.actdura != null ? row.actdura : 'NULL';
        const dt  = `'${row.operationDate.toISOString().slice(0, 19)}'`;
        const amt = row.amount != null ? row.amount : 'NULL';
        const sap  = row.sapOrderId ? `N'${row.sapOrderId.replace(/'/g, "''")}'` : 'NULL';
        const wcrc = row.wcrCode ? `N'${row.wcrCode.replace(/'/g, "''")}'` : 'NULL';
        const aa   = row.aarea ? `N'${row.aarea.replace(/'/g, "''")}'` : 'NULL';
        return `(${uid}, ${wc}, ${ot}, ${pa}, ${cnt}, ${act}, ${dt}, ${amt}, ${sap}, ${wcrc}, ${aa})`;
      }).join(',\n          ');

      try {
        await pool.request().query(`
          INSERT INTO operations (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
          VALUES ${values}
        `);
        batchSaved += chunk.length;
      } catch (err) {
        console.error(`     INSERT error: ${err.message}`);
        // Fallback: try MERGE for idempotency
        try {
          await pool.request().query(`
            MERGE operations AS target
            USING (
              SELECT * FROM (VALUES
                ${values}
              ) AS source(user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
            ) AS source
            ON (
              target.user_id        = source.user_id
              AND target.sap_order_id   = source.sap_order_id
              AND target.operation_type = source.operation_type
            )
            WHEN MATCHED THEN
              UPDATE SET
                target.count            = source.count,
                target.amount           = source.amount,
                target.actdura          = source.actdura,
                target.participant_area = source.participant_area,
                target.wcr_code         = source.wcr_code,
                target.aarea            = source.aarea,
                target.updated_at       = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
              VALUES (source.user_id, source.warehouse_code, source.operation_type, source.participant_area,
                      source.count, source.actdura, source.operation_date, source.amount, source.sap_order_id,
                      source.wcr_code, source.aarea);
          `);
          batchSaved += chunk.length;
        } catch (mergeErr) {
          console.error(`     MERGE error: ${mergeErr.message}`);
          whStats.errors++;
          totalErrors++;
        }
      }
    }

    whStats.saved = batchSaved;
    totalSaved   += batchSaved;
    warehouseStats.set(wh.code, whStats);

    console.log(`     Сохранено: ${batchSaved}  noAEI=${whStats.skippedAei}  noWCR=${whStats.skippedWcr}  noTariff=${whStats.skippedTariff}`);

    await sleep(300);
  }

  // ─── ШАГ 5. ИТОГИ ──────────────────────────────────────────
  console.log('\n\n================================================================');
  console.log('  ИТОГИ ПЕРЕСИНХРОНИЗАЦИИ МАРТА 2026');
  console.log('================================================================\n');

  console.log(`   Из SAP получено:      ${totalFromSap}`);
  console.log(`   Сохранено в БД:       ${totalSaved}`);
  console.log(`   Пропущено (АЕИ=0):   ${totalSkippedAei}`);
  console.log(`   Пропущено (нет WCR): ${totalSkippedWcr}`);
  console.log(`   Пропущено (нет тар.):${totalSkippedTar}`);
  console.log(`   Новых пользователей:  ${totalNewUsers}`);
  console.log(`   Ошибок:               ${totalErrors}\n`);

  console.log('   -- По складам --');
  for (const [code, st] of warehouseStats) {
    if (st.fetched > 0 || st.errors > 0) {
      console.log(`   ${code}: SAP=${st.fetched} -> saved=${st.saved} (noAEI=${st.skippedAei} noWCR=${st.skippedWcr} noTar=${st.skippedTariff} err=${st.errors})`);
    }
  }

  if (missingWcrs.size > 0) {
    console.log('\n   -- Неизвестные WCR (не в wcr_mapping) --');
    Array.from(missingWcrs.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([wcr, cnt]) => console.log(`   WCR="${wcr}": ${cnt} записей`));
  }

  if (missingTariffs.size > 0) {
    console.log('\n   -- Операции без тарифа --');
    Array.from(missingTariffs.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([op, cnt]) => console.log(`   ${op}: ${cnt} записей`));
  }

  // ─── ШАГ 6. ПРОВЕРКА — суммы за март по сотрудникам ─────────
  console.log('\n=== ШАГ 6. СУММЫ ЗА МАРТ ПО СОТРУДНИКАМ ===\n');

  const checkRes = await pool.request().query(`
    SELECT
      u.fio,
      ROUND(SUM(o.amount), 2) AS total_amount,
      COUNT(*) as ops_count
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date < '2026-04-01'
    GROUP BY u.fio
    ORDER BY total_amount DESC
  `);

  console.log(`   ${'ФИО'.padEnd(45)} ${'Сумма'.padStart(12)} ${'Операций'.padStart(10)}`);
  console.log('   ' + '─'.repeat(70));
  for (const row of checkRes.recordset) {
    console.log(`   ${row.fio.padEnd(45)} ${parseFloat(row.total_amount).toFixed(2).padStart(12)} ${row.ops_count.toString().padStart(10)}`);
  }

  await pool.close();
  console.log('\nПЕРЕСИНХРОНИЗАЦИЯ МАРТА 2026 ЗАВЕРШЕНА\n');
}

main().catch(err => {
  console.error('\nКритическая ошибка:', err.message);
  console.error(err.stack);
  process.exit(1);
});
