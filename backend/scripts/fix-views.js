const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  user: 'sa',
  password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
};

async function fixViews() {
  console.log('🔧 Исправление SQL Views...\n');
  
  let pool;
  try {
    pool = await sql.connect(config);
    
    const sqlContent = fs.readFileSync(
      path.join(__dirname, '../../database/fix-views.sql'),
      'utf8'
    );
    
    const batches = sqlContent
      .split(/^\s*GO\s*$/gmi)
      .filter(b => b.trim() && !b.match(/USE\s+/i));

    for (const batch of batches) {
      if (batch.trim()) {
        await pool.request().query(batch);
        process.stdout.write('.');
      }
    }
    
    console.log('\n✅ Views исправлены!');
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

fixViews();
