const sql = require('mssql');

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

async function addActduraField() {
  let pool;
  try {
    pool = await sql.connect(config);
    await pool.request().query('ALTER TABLE operations ADD actdura FLOAT');
    console.log('✅ Поле actdura добавлено');
  } catch (error) {
    if (error.message.includes('already')) {
      console.log('✅ Поле actdura уже существует');
    } else {
      console.error('❌', error.message);
    }
  } finally {
    if (pool) await pool.close();
  }
}

addActduraField();
