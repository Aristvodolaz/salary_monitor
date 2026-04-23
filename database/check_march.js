const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 120000,
};

async function main() {
  const pool = await sql.connect(cfg);

  // Март в operations: по складам
  const march = await pool.request().query(`
    SELECT warehouse_code,
           COUNT(*)                                         AS records,
           COUNT(DISTINCT user_id)                         AS users,
           SUM(CASE WHEN ISNULL(amount,0)>0 THEN 1 ELSE 0 END) AS with_amount,
           SUM(CASE WHEN ISNULL(amount,0)=0 THEN 1 ELSE 0 END) AS zero_amount,
           ROUND(SUM(ISNULL(amount,0)),2)                  AS total_amount_rub,
           COUNT(DISTINCT wcr_code)                        AS unique_wcr
    FROM operations
    WHERE operation_date >= '2026-03-01'
      AND operation_date <  '2026-04-01'
    GROUP BY warehouse_code
    ORDER BY warehouse_code
  `);
  console.log('\n=== operations МАРТ 2026 по складам ===');
  console.table(march.recordset);

  // Топ WCR без тарифа в марте
  const noTariff = await pool.request().query(`
    SELECT TOP 20
      o.wcr_code,
      o.operation_type,
      o.participant_area,
      COUNT(*) AS cnt,
      SUM(o.[count]) AS total_aei,
      SUM(ISNULL(o.prod_count,0)) AS total_prod
    FROM operations o
    WHERE o.operation_date >= '2026-03-01'
      AND o.operation_date <  '2026-04-01'
      AND ISNULL(o.amount,0) = 0
      AND o.wcr_code IS NOT NULL
    GROUP BY o.wcr_code, o.operation_type, o.participant_area
    ORDER BY cnt DESC
  `);
  console.log('\n=== ТОП-20 WCR с amount=0 в марте (для диагностики) ===');
  console.table(noTariff.recordset);

  // Текущий wcr_mapping (сколько кодов после 017)
  const wcrMap = await pool.request().query(`
    SELECT participant_area, COUNT(*) AS codes
    FROM wcr_mapping WHERE is_active=1
    GROUP BY participant_area ORDER BY participant_area
  `);
  console.log('\n=== wcr_mapping (после миграции 017) ===');
  console.table(wcrMap.recordset);

  // Тарифы - что есть
  const tariffs = await pool.request().query(`
    SELECT warehouse_code, COUNT(*) AS tariff_count, MIN(valid_from) AS from_, MAX(valid_from) AS to_
    FROM tariffs WHERE is_active=1
    GROUP BY warehouse_code ORDER BY warehouse_code
  `);
  console.log('\n=== tariffs ===');
  console.table(tariffs.recordset);

  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
