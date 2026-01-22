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

async function recalculateAmounts() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Читаем SQL скрипт
    const sqlPath = path.join(__dirname, '../../database/recalculate-operations-amount.sql');
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');

    // Выполняем скрипт
    console.log('🔄 Выполнение пересчета...\n');
    const result = await sql.query(sqlScript);

    console.log('\n✅ Пересчет завершен успешно!');
    
    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

recalculateAmounts();
