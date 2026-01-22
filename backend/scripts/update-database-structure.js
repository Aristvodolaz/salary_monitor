const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function updateDatabaseStructure() {
  console.log('🔄 Обновление структуры БД для работы с реальными данными SAP...\n');

  let pool;

  try {
    pool = await sql.connect(config);
    console.log('✅ Подключено к БД\n');

    // 1. Добавление поля participant_area
    console.log('1️⃣ Обновление структуры таблицы operations...');
    const alterSql = fs.readFileSync(
      path.join(__dirname, '../../database/alter-operations-add-area.sql'),
      'utf8'
    );
    const alterBatches = alterSql.split(/^\s*GO\s*$/gmi).filter(b => b.trim() && !b.match(/USE\s+/i));
    for (const batch of alterBatches) {
      if (batch.trim()) await pool.request().query(batch);
    }
    console.log('✅ Структура обновлена\n');

    // 2. Обновление тарифов
    console.log('2️⃣ Загрузка тарифов из Приложения 1...');
    const tariffsSql = fs.readFileSync(
      path.join(__dirname, '../../database/update-tariffs.sql'),
      'utf8'
    );
    const tariffsBatches = tariffsSql.split(/^\s*GO\s*$/gmi).filter(b => b.trim() && !b.match(/USE\s+/i));
    for (const batch of tariffsBatches) {
      if (batch.trim()) await pool.request().query(batch);
    }
    console.log('✅ Тарифы загружены (всего строк в tariffs):', 
      (await pool.request().query('SELECT COUNT(*) as cnt FROM tariffs')).recordset[0].cnt
    );

    // 3. Обновление матрицы качества
    console.log('\n3️⃣ Загрузка матрицы качества из Приложения 2...');
    const qualitySql = fs.readFileSync(
      path.join(__dirname, '../../database/update-quality-matrix.sql'),
      'utf8'
    );
    const qualityBatches = qualitySql.split(/^\s*GO\s*$/gmi).filter(b => b.trim() && !b.match(/USE\s+/i));
    for (const batch of qualityBatches) {
      if (batch.trim()) await pool.request().query(batch);
    }
    console.log('✅ Матрица качества загружена\n');

    console.log('🎉 Обновление завершено!\n');
    console.log('📋 Следующий шаг: Запустите синхронизацию с SAP');
    console.log('   node scripts/test-sap-sync.js');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

updateDatabaseStructure();
