const sql = require('mssql');
const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};
async function run() {
  const pool = await sql.connect(config);
  await pool.request().query(`
    ALTER VIEW v_salary_details AS
    SELECT 
        o.id AS operation_id,
        u.id AS user_id,
        u.employee_id,
        u.fio,
        u.warehouse_id,
        w.code AS warehouse_code,
        w.name AS warehouse_name,
        o.operation_type,
        o.participant_area,
        o.count AS aei_count,
        o.operation_date,
        t.rate,
        t.norm_aei_per_hour,
        o.amount AS base_amount
    FROM operations o
    INNER JOIN users u ON o.user_id = u.id
    INNER JOIN warehouses w ON o.warehouse_code = w.code
    LEFT JOIN tariffs t ON 
        (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
        AND o.operation_type = t.operation_type
        AND o.operation_date >= t.valid_from
        AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
        AND t.is_active = 1
    WHERE u.is_active = 1
      AND (o.wcr_code IS NULL OR o.wcr_code NOT IN ('FIXAEIMAR', 'FIXPCKMAR'))
  `);
  console.log('View v_salary_details updated.');
  pool.close();
}
run().catch(console.error);