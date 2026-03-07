/**
 * Удаление складов-участков из таблицы warehouses
 * Участки (М2, М3, М4, М5, МС, ДО, ФС, ПМ) - это НЕ склады SAP, а типы операций
 */

const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'icY2eGuyfU',
  server: process.env.DB_HOST || 'PRM-SRV-MSSQL-01.komus.net',
  port: parseInt(process.env.DB_PORT || '59587'),
  database: process.env.DB_NAME || 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function removeSectionWarehouses() {
  try {
    console.log('🔄 УДАЛЕНИЕ СКЛАДОВ-УЧАСТКОВ\n');
    console.log('='.repeat(70));
    
    await sql.connect(dbConfig);
    console.log('✅ Подключено к БД\n');
    
    // Список кодов участков, которые нужно удалить
    const sectionsToRemove = ['М2', 'М3', 'М4', 'М5', 'МС', 'ДО', 'ФС', 'ПМ'];
    
    console.log('📋 Склады-участки для удаления:');
    sectionsToRemove.forEach(code => console.log(`   - ${code}`));
    console.log('');
    
    // Проверяем, есть ли пользователи, привязанные к этим складам
    for (const code of sectionsToRemove) {
      const warehouse = await sql.query`
        SELECT id, code, name FROM warehouses WHERE code = ${code}
      `;
      
      if (warehouse.recordset.length > 0) {
        const warehouseId = warehouse.recordset[0].id;
        
        // Проверяем пользователей
        const users = await sql.query`
          SELECT COUNT(*) as count FROM users WHERE warehouse_id = ${warehouseId}
        `;
        
        console.log(`📦 ${code}: пользователей = ${users.recordset[0].count}`);
        
        if (users.recordset[0].count > 0) {
          console.log(`   ⚠️ ВНИМАНИЕ: У склада ${code} есть привязанные пользователи!`);
          console.log(`   Пропускаем удаление...`);
        } else {
          // Удаляем склад
          await sql.query`
            DELETE FROM warehouses WHERE code = ${code}
          `;
          console.log(`   ✅ Удален`);
        }
      } else {
        console.log(`📦 ${code}: не найден в БД`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 Оставшиеся склады:');
    console.log('='.repeat(70));
    
    const remainingWarehouses = await sql.query`
      SELECT code, name, is_active FROM warehouses ORDER BY code
    `;
    
    console.table(remainingWarehouses.recordset.map(w => ({
      'Код': w.code,
      'Название': w.name,
      'Активен': w.is_active ? 'Да' : 'Нет'
    })));
    
    await sql.close();
    console.log('\n✅ ГОТОВО!\n');
    
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

removeSectionWarehouses();
