/**
 * ПЕРЕСИНХРОНИЗАЦИЯ МАРТА 2026 v2
 * Тарифы уже обновлены в БД. Просто загружаем данные из SAP и сохраняем.
 * Увеличен BATCH_SIZE до 500 для скорости.
 */

const axios = require('axios');
const sql   = require('mssql');
const path  = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server:   process.env.DB_HOST     || 'PRM-SRV-MSSQL-01.komus.net',
  port:     parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME     || 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
  connectionTimeout: 30000,
};

const axiosInstance = axios.create({
  baseURL:  process.env.SAP_ODATA_BASE_URL,
  auth:     { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout:  180000,
  proxy:    false,
});

const PERIOD_START = new Date(Date.UTC(2026, 2, 1));
const PERIOD_END   = new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999));
const CHUNK_DAYS   = 5;
const MAX_RETRIES  = 3;
const BATCH_SIZE   = 500;

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
        console.error(`   FAIL ${label}: ${msg}`);
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      console.warn(`   WARN ${label}: ${msg} — retry ${attempt}/${MAX_RETRIES}`);
      await sleep(delay);
    }
  }
}

function escSql(s) { return s.replace(/'/g, "''"); }

async function main() {
  console.log('=== ПЕРЕСИНХРОНИЗАЦИЯ МАРТА 2026 v2 ===\n');

  const pool = await sql.connect(dbConfig);
  console.log('Подключено к БД');

  // Проверяем что мартовские тарифы на месте
  const tarCheck = await pool.request().query(`
    SELECT COUNT(*) as cnt FROM tariffs
    WHERE is_active = 1 AND valid_from = '2026-03-01'
  `);
  console.log(`Мартовских тарифов: ${tarCheck.recordset[0].cnt}`);

  // Загрузка контекста
  const warehouseRes = await pool.request().query(
    `SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY code`
  );
  const warehouses = warehouseRes.recordset;
  const warehouseIdMap = new Map(warehouses.map(w => [w.code, w.id]));

  const wcrRes = await pool.request().query(
    `SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1`
  );
  const wcrMap = new Map(
    wcrRes.recordset.map(r => [r.wcr_code, { opType: r.operation_type, area: r.participant_area }])
  );

  const tariffRes = await pool.request().query(`
    SELECT operation_type, rate
    FROM tariffs
    WHERE is_active = 1
      AND valid_from <= '2026-03-31'
      AND (valid_to IS NULL OR valid_to >= '2026-03-01')
    ORDER BY valid_from DESC
  `);
  const tariffMap = new Map();
  for (const t of tariffRes.recordset) {
    if (!tariffMap.has(t.operation_type)) {
      tariffMap.set(t.operation_type, parseFloat(t.rate));
    }
  }
  console.log(`Тарифов: ${tariffMap.size}, WCR: ${wcrMap.size}, Складов: ${warehouses.length}`);

  const usersRes = await pool.request().query(`SELECT id, employee_id FROM users`);
  const userMap = new Map(usersRes.recordset.map(u => [u.employee_id, u.id]));

  // Очистка
  const delRes = await pool.request().query(`
    DELETE FROM operations
    WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
  `);
  console.log(`Удалено за март: ${delRes.rowsAffected[0]}\n`);

  // Загрузка из SAP
  const chunks = getDateChunks(PERIOD_START, PERIOD_END, CHUNK_DAYS);
  let totalSaved = 0, totalSkipped = 0, totalErrors = 0, totalNewUsers = 0;
  const missingWcrs = new Map();

  for (const wh of warehouses) {
    console.log(`\n-- ${wh.code} (${wh.name}) --`);

    let allItems = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const c = chunks[ci];
      const filter = `$filter=(Lgnum eq '${wh.code}' and (ConfirmedDate ge datetime'${fmtDate(c.start)}' and ConfirmedDate le datetime'${fmtDate(c.end)}'))`;
      const url = `/WHOSet?${filter}&$format=json`;
      try {
        const items = await fetchWithRetry(url, `${wh.code} ${ci+1}/${chunks.length}`);
        allItems = allItems.concat(items);
      } catch (err) {
        totalErrors++;
      }
    }

    console.log(`  SAP: ${allItems.length}`);
    if (allItems.length === 0) continue;

    // Подготовка батча
    const batch = [];
    let skipped = 0;

    for (const item of allItems) {
      const aeiRaw   = parseFloat(item.ZsumAmountItm || '0');
      const aeiCount = Math.round(aeiRaw);
      if (aeiCount <= 0) { skipped++; continue; }

      const employeeId = (item.Employeeid || item.Processor || '').trim();
      if (!employeeId) { skipped++; continue; }

      const wcr      = (item.Wcr || '').trim();
      const wcrEntry = wcrMap.get(wcr);
      if (!wcrEntry) {
        skipped++;
        missingWcrs.set(wcr, (missingWcrs.get(wcr) || 0) + 1);
        continue;
      }

      const rate = tariffMap.get(wcrEntry.opType);
      if (rate == null) { skipped++; continue; }

      let operationDate = new Date();
      if (item.ConfirmedDate) {
        const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
        if (m) operationDate = new Date(parseInt(m[1], 10));
      }

      let userId = userMap.get(employeeId);
      if (userId === undefined) {
        const fio = `${(item.McName1 || '').trim()} ${(item.McName2 || '').trim()}`.trim() || `Сотрудник ${employeeId}`;
        const whId = warehouseIdMap.get(wh.code);
        if (!whId) continue;
        try {
          const ins = await pool.request()
            .input('eid', sql.VarChar(50), employeeId)
            .input('fio', sql.NVarChar(200), fio)
            .input('wid', sql.Int, whId)
            .query(`INSERT INTO users (employee_id, fio, warehouse_id, role, is_active) OUTPUT INSERTED.id VALUES (@eid, @fio, @wid, 'employee', 1)`);
          userId = ins.recordset[0].id;
          userMap.set(employeeId, userId);
          totalNewUsers++;
        } catch (err) {
          if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate')) {
            const re = await pool.request().input('eid', sql.VarChar(50), employeeId).query(`SELECT id FROM users WHERE employee_id = @eid`);
            if (re.recordset.length > 0) { userId = re.recordset[0].id; userMap.set(employeeId, userId); }
            else continue;
          } else continue;
        }
      }

      const actdura = parseFloat(item.Actdura || '0');
      const amount  = aeiCount * rate;

      batch.push({
        userId, warehouseCode: wh.code, operationType: wcrEntry.opType,
        participantArea: wcrEntry.area || null, count: aeiCount, actdura,
        operationDate, amount, sapOrderId: item.Who || null,
        wcrCode: wcr, aarea: (item.Aarea || '').trim() || null,
      });
    }

    totalSkipped += skipped;

    // Вставка большими батчами
    let whSaved = 0;
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk = batch.slice(i, i + BATCH_SIZE);
      const values = chunk.map(row => {
        const dt = `'${row.operationDate.toISOString().slice(0, 19)}'`;
        return `(${row.userId}, N'${escSql(row.warehouseCode)}', N'${escSql(row.operationType)}', ${row.participantArea ? `N'${escSql(row.participantArea)}'` : 'NULL'}, ${row.count}, ${row.actdura}, ${dt}, ${row.amount}, ${row.sapOrderId ? `N'${escSql(row.sapOrderId)}'` : 'NULL'}, ${row.wcrCode ? `N'${escSql(row.wcrCode)}'` : 'NULL'}, ${row.aarea ? `N'${escSql(row.aarea)}'` : 'NULL'})`;
      }).join(',\n');

      try {
        await pool.request().query(`
          INSERT INTO operations (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id, wcr_code, aarea)
          VALUES ${values}
        `);
        whSaved += chunk.length;
      } catch (err) {
        console.error(`  INSERT err batch ${Math.floor(i/BATCH_SIZE)+1}: ${err.message.slice(0,100)}`);
        totalErrors++;
      }

      // Progress log every 5000 records
      if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
        process.stdout.write(`  ... ${Math.min(i + BATCH_SIZE, batch.length)}/${batch.length}\n`);
      }
    }

    whSaved && console.log(`  Saved: ${whSaved}, Skipped: ${skipped}`);
    totalSaved += whSaved;

    await sleep(200);
  }

  // Итоги
  console.log('\n=== ИТОГИ ===');
  console.log(`Сохранено: ${totalSaved}`);
  console.log(`Пропущено: ${totalSkipped}`);
  console.log(`Новых юзеров: ${totalNewUsers}`);
  console.log(`Ошибок: ${totalErrors}`);

  if (missingWcrs.size > 0) {
    console.log('\nНеизвестные WCR:');
    Array.from(missingWcrs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .forEach(([wcr, cnt]) => console.log(`  ${wcr}: ${cnt}`));
  }

  // Проверка сумм
  console.log('\n=== СУММЫ ЗА МАРТ ===\n');
  const check = await pool.request().query(`
    SELECT u.fio, ROUND(SUM(o.amount), 2) AS total, COUNT(*) as ops
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    WHERE o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
    GROUP BY u.fio
    ORDER BY total DESC
  `);
  for (const r of check.recordset) {
    console.log(`${r.fio.padEnd(45)} ${parseFloat(r.total).toFixed(2).padStart(12)} (${r.ops} ops)`);
  }

  await pool.close();
  console.log('\nГОТОВО');
}

main().catch(err => { console.error('FATAL:', err.message, err.stack); process.exit(1); });
