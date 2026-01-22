const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function updateViews() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Читаем SQL скрипт views
    const viewsPath = path.join(__dirname, '../../database/views.sql');
    const viewsScript = fs.readFileSync(viewsPath, 'utf8');

    // Разбиваем на батчи по GO
    const batches = viewsScript
      .split(/^\s*GO\s*$/mi)
      .map(b => b.trim())
      .filter(b => b.length > 0 && !b.startsWith('--') && !b.startsWith('PRINT'));

    console.log(`🔄 Выполнение ${batches.length} SQL батчей...\n`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch.includes('CREATE VIEW') || batch.includes('DROP VIEW')) {
        try {
          await sql.query(batch);
          console.log(`✅ Батч ${i + 1}/${batches.length} выполнен`);
        } catch (err) {
          console.error(`❌ Ошибка в батче ${i + 1}:`, err.message);
        }
      }
    }

    console.log('\n✅ Все views обновлены!');
    
    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

updateViews();
