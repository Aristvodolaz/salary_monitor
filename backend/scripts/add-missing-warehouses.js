const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'icY2eGuyfU',
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Склады-участки, которые нужно добавить
const warehousesToAdd = [
  { code: 'ФС', name: 'Участок ФС (Фронт-стор)' },
  { code: 'ДО', name: 'Участок ДО (Доукомплектация)' },
  { code: 'МС', name: 'Участок МС (Мелкоштучная)' },
  { code: 'М2', name: 'Участок М2' },
  { code: 'М3', name: 'Участок М3' },
  { code: 'М4', name: 'Участок М4' },
  { code: 'М5', name: 'Участок М5' },
  { code: 'ПМ', name: 'Участок ПМ (Паллетный метод)' },
];

async function addWarehouses() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    console.log('📦 Добавление складов-участков:\n');

    for (const wh of warehousesToAdd) {
      // Проверка существования
      const checkResult = await sql.query`
        SELECT id FROM warehouses WHERE code = ${wh.code}
      `;

      if (checkResult.recordset.length > 0) {
        console.log(`⏭️  ${wh.code} - уже существует, пропускаем`);
        continue;
      }

      // Добавление
      await sql.query`
        INSERT INTO warehouses (code, name, is_active, created_at)
        VALUES (${wh.code}, ${wh.name}, 1, GETDATE())
      `;
      console.log(`✅ ${wh.code} - ${wh.name} - добавлен`);
    }

    console.log('\n✅ Готово!');
    
    // Проверка результата
    console.log('\n📊 Текущий список складов:');
    const allWarehouses = await sql.query`
      SELECT code, name, is_active
      FROM warehouses
      ORDER BY 
        CASE 
          WHEN code LIKE '0%' THEN 1
          WHEN code = 'ALL' THEN 2
          ELSE 3
        END,
        code
    `;
    
    allWarehouses.recordset.forEach(wh => {
      const status = wh.is_active ? '✅' : '❌';
      console.log(`${status} ${wh.code.padEnd(10)} - ${wh.name}`);
    });

    await sql.close();
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

addWarehouses();
