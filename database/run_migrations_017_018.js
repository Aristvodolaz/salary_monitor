/**
 * Запуск миграций 017 и 018, затем пересчёт зарплаты за март.
 * Запуск: node database/run_migrations_017_018.js
 */

const fs   = require('fs');
const path = require('path');
const { createRequire } = require('module');
const sql  = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 120000,
};

function splitBatches(content) {
  return content
    .split(/^\s*GO\s*$/im)
    .map(b => b.trim())
    .filter(b => b.length > 0);
}

async function runFile(pool, filePath) {
  const label   = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const batches = splitBatches(content);

  console.log(`\n📄 ${label}: ${batches.length} батч(а/ей)...`);
  for (let i = 0; i < batches.length; i++) {
    try {
      const res = await pool.request().query(batches[i]);
      // Печатаем SELECT-результаты (диагностика)
      if (res.recordset && res.recordset.length > 0) {
        console.table(res.recordset);
      }
    } catch (err) {
      console.error(`  ❌ Батч ${i + 1}/${batches.length}: ${err.message}`);
      console.error(`     SQL: ${batches[i].slice(0, 200)}...`);
      throw err;
    }
  }
  console.log(`  ✅ ${label} выполнен`);
}

async function main() {
  console.log('🔗 Подключение к БД...');
  const pool = await sql.connect(config);
  console.log('✅ Подключено\n');

  const migrDir  = path.join(__dirname, 'migrations');
  const recalcFile = path.join(__dirname, 'recalculate-march-2026.sql');

  try {
    // 1. Миграция 017: добавляем АЕИ-коды в wcr_mapping
    await runFile(pool, path.join(migrDir, '017_add_aei_to_wcr_mapping.sql'));

    // 2. Миграция 018: создаём таблицу sap_raw
    await runFile(pool, path.join(migrDir, '018_create_sap_raw.sql'));

    // 3. Пересчёт зарплаты за март
    console.log('\n========================================');
    console.log('🔄 Пересчёт зарплаты за март 2026...');
    await runFile(pool, recalcFile);

  } finally {
    await pool.close();
  }

  console.log('\n========================================');
  console.log('✅ Всё выполнено успешно!');
}

main().catch(err => {
  console.error('\n❌ Ошибка:', err.message || err);
  process.exit(1);
});
