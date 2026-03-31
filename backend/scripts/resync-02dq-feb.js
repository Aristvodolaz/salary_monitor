const axios = require('axios');
const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME, options: { encrypt: false, trustServerCertificate: true }
};

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 300000,
});

async function resync02DQ() {
  const pool = await sql.connect(config);
  
  // 1. Reload Mappings & Tariffs
  const wcrRes = await pool.request().query('SELECT * FROM wcr_mapping WHERE is_active = 1');
  const wcrMap = {};
  wcrRes.recordset.forEach(r => { 
    wcrMap[r.wcr_code] = { type: r.operation_type, area: r.participant_area }; 
  });
  
  const tariffRes = await pool.request().query('SELECT * FROM tariffs WHERE is_active = 1 AND valid_from <= \'2026-02-01\'');
  const tariffMap = {};
  tariffRes.recordset.forEach(r => { tariffMap[r.operation_type] = r.rate; });

  const chunks = [
    { start: '2026-02-01T00:00:00', end: '2026-02-07T23:59:59' },
    { start: '2026-02-08T00:00:00', end: '2026-02-14T23:59:59' },
    { start: '2026-02-15T00:00:00', end: '2026-02-21T23:59:59' },
    { start: '2026-02-22T00:00:00', end: '2026-02-28T23:59:59' }
  ];

  console.log(`📡 Перезагрузка склада 02DQ (Февраль 2026) с НОВЫМИ тарифами...`);
  
  for (const c of chunks) {
    const url = `/WHOSet?$filter=(Lgnum eq '02DQ' and (ConfirmedDate ge datetime'${c.start}' and ConfirmedDate le datetime'${c.end}'))&$format=json`;
    console.log(`   🔸 Чанк ${c.start.slice(8,10)}-${c.end.slice(8,10)}...`);
    try {
      const resp = await axiosInstance.get(url);
      const results = resp.data?.d?.results || [];
      console.log(`      Получено: ${results.length}`);
      
      for (const item of results) {
        const employeeId = (item.Employeeid || item.Processor || '').trim();
        if (!employeeId) continue;
        
        const userRes = await pool.request().input('eid', sql.NVarChar, employeeId).query('SELECT id FROM users WHERE employee_id = @eid');
        if (userRes.recordset.length === 0) continue;
        const userId = userRes.recordset[0].id;
        
        const mapping = wcrMap[item.Wcr];
        if (!mapping) continue;
        
        const rate = tariffMap[mapping.type];
        if (!rate) continue;
        
        const aeiCount = Math.round(parseFloat(item.ZsumAmountItm || '0'));
        if (aeiCount <= 0) continue;
        
        const amount = aeiCount * rate;
        const actdura = parseFloat(item.Actdura || '0');
        
        await pool.request()
          .input('userId', sql.Int, userId)
          .input('wh', sql.NVarChar, '02DQ')
          .input('type', sql.NVarChar, mapping.type)
          .input('count', sql.Int, aeiCount)
          .input('date', sql.DateTime, new Date(item.ConfirmedDate))
          .input('amount', sql.Float, amount)
          .input('order', sql.NVarChar, item.Who || '')
          .input('area', sql.NVarChar, mapping.area)
          .input('dura', sql.Float, actdura)
          .query(`
            MERGE INTO operations AS target
            USING (SELECT @userId as u, @wh as w, @type as t, @date as d, @order as o) AS source
            ON (target.user_id = source.u AND target.warehouse_code = source.w AND target.operation_type = source.t AND target.operation_date = source.d AND target.sap_order_id = source.o)
            WHEN MATCHED THEN 
              UPDATE SET count = @count, amount = @amount, participant_area = @area, actdura = @dura, updated_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (user_id, warehouse_code, operation_type, count, operation_date, amount, sap_order_id, participant_area, actdura, created_at, updated_at)
              VALUES (@userId, @wh, @type, @count, @date, @amount, @order, @area, @dura, GETDATE(), GETDATE());
          `);
      }
    } catch (err) { console.error(`      Ошибка: ${err.message}`); }
  }

  console.log('\n📈 Подсчет результата для Канчуриной (565)...');
  const kanRes = await pool.request().query('SELECT SUM(amount) as total FROM operations WHERE user_id = 565 AND operation_date >= \'2026-02-01\' AND operation_date <= \'2026-02-28\'');
  console.log(`💵 Итоговая зарплата за февраль: ${kanRes.recordset[0].total}`);

  await pool.close();
  console.log('✅ Готово!');
}

resync02DQ();
