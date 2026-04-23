/**
 * Создаёт суперадмина, который видит все склады.
 * Запуск: node database/create_superadmin.js
 */
const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 60000,
};

async function main() {
  const pool = await sql.connect(cfg);
  console.log('✅ Подключено\n');

  // Проверяем, есть ли уже суперадмин
  const existing = await pool.request().query(`
    SELECT id, employee_id, fio, role FROM users WHERE role = 'superadmin'
  `);
  if (existing.recordset.length > 0) {
    console.log('ℹ️  Суперадмин уже существует:');
    console.table(existing.recordset);
    await pool.close();
    return;
  }

  // warehouse_id = NULL для суперадмина (нет привязки к конкретному складу)
  // Если NULL не разрешён, используем первый склад (id=1)
  // Проверяем nullability
  const colInfo = await pool.request().query(`
    SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='users' AND COLUMN_NAME='warehouse_id'
  `);
  const nullable = colInfo.recordset[0]?.IS_NULLABLE === 'YES';

  if (!nullable) {
    // Разрешаем NULL
    await pool.request().query(`ALTER TABLE users ALTER COLUMN warehouse_id INT NULL`);
    console.log('✅ warehouse_id теперь NULL-able');
  }

  // Расширяем CHECK constraint на role — добавляем 'superadmin'
  const ck = await pool.request().query(`
    SELECT cc.name AS constraint_name
    FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    WHERE t.name = 'users' AND cc.definition LIKE '%role%'
  `);
  if (ck.recordset.length > 0) {
    const constraintName = ck.recordset[0].constraint_name;
    await pool.request().query(`ALTER TABLE users DROP CONSTRAINT [${constraintName}]`);
    await pool.request().query(`ALTER TABLE users ADD CONSTRAINT [${constraintName}] CHECK (role IN ('employee', 'admin', 'superadmin'))`);
    console.log(`✅ CHECK constraint обновлён: + superadmin`);
  }

  // Создаём суперадмина
  await pool.request().query(`
    INSERT INTO users (employee_id, fio, role, warehouse_id, is_active, created_at, updated_at)
    VALUES ('superadmin', 'Суперадминистратор', 'superadmin', NULL, 1, GETDATE(), GETDATE())
  `);

  const created = await pool.request().query(`
    SELECT id, employee_id, fio, role, warehouse_id FROM users WHERE employee_id = 'superadmin'
  `);
  console.log('✅ Суперадмин создан:');
  console.table(created.recordset);
  console.log('\n📋 Для входа используйте ШК: superadmin');

  await pool.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
