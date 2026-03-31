/**
 * Диагностика: Турсунов и Захаров за февраль 2026
 */
const sql  = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

async function main() {
  const pool = await sql.connect(dbConfig);

  // 1. Найти Турсунова в users
  console.log('=== Поиск Турсунова в users ===');
  const turs = await pool.request().query(`
    SELECT id, fio, employee_id, warehouse_id
    FROM users
    WHERE fio LIKE '%ТУРСУНОВ%' OR fio LIKE '%Турсунов%'
  `);
  console.log(turs.recordset);

  // Проверить операции Турсунова за февраль (если есть)
  for (const u of turs.recordset) {
    console.log(`\n--- Операции user_id=${u.id} (${u.fio}) за февраль ---`);
    const ops = await pool.request()
      .input('uid', sql.Int, u.id)
      .query(`
        SELECT operation_type, COUNT(*) as cnt, SUM([count]) as aei, ROUND(SUM(amount),2) as total
        FROM operations
        WHERE user_id = @uid
          AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
        GROUP BY operation_type
      `);
    if (ops.recordset.length === 0) console.log('  Нет операций');
    else console.log(ops.recordset);
  }

  // 2. Захаров — проверим детально, чего не хватает до 16399
  console.log('\n=== Захаров: детали за февраль ===');
  const zakh = await pool.request().query(`
    SELECT id, fio, employee_id FROM users
    WHERE fio LIKE '%ЗАХАРОВ МИХАИЛ%'
  `);
  console.log(zakh.recordset);

  for (const u of zakh.recordset) {
    // Проверим тариф
    console.log(`\n--- Тариф для ФС_Коробочная комплектация на складе 02DQ ---`);
    const tariff = await pool.request().query(`
      SELECT * FROM tariffs
      WHERE operation_type LIKE '%Коробочная комплектация%'
        AND warehouse_code = '02DQ'
    `);
    console.log(tariff.recordset);

    // Детально по дням
    console.log(`\n--- Захаров: операции по дням ---`);
    const daily = await pool.request()
      .input('uid', sql.Int, u.id)
      .query(`
        SELECT
          CAST(operation_date AS DATE) as dt,
          COUNT(*) as cnt,
          SUM([count]) as aei,
          ROUND(SUM(amount), 2) as total
        FROM operations
        WHERE user_id = @uid
          AND operation_date >= '2026-02-01' AND operation_date < '2026-03-01'
        ORDER BY dt
      `);
    console.log(daily.recordset);

    // Проверим: 16399 / rate = ожидаемое кол-во АЕИ
    console.log(`\nАнализ: В БД 2644 АЕИ → 16392.8 руб. Rate = ${16392.8 / 2644}`);
    console.log(`Эталон 16399 руб. → АЕИ = ${16399 / (16392.8 / 2644)}`);
    console.log(`Разница в АЕИ: ${16399 / (16392.8 / 2644) - 2644}`);
  }

  await pool.close();
}

main().catch(err => { console.error(err); process.exit(1); });
