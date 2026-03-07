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

// Маппинг из sap-integration.service.ts
const mapping = {
  // ФС - желтая группа
  'PCST': 'ФС', 'PST2': 'ФС', 'PSTT': 'ФС', 'PST1': 'ФС', 'PST3': 'ФС', 'PZST': 'ФС', 'PSST': 'ФС',
  'PCM1': 'ФС', 'PM12': 'ФС', 'PM11': 'ФС', 'PM13': 'ФС', 'PS1L': 'ФС', 'PS1S': 'ФС', 'PS1M': 'ФС', 'PSM1': 'ФС',
  'PCCD': 'ФС', 'PCD2': 'ФС', 'PCD1': 'ФС', 'PZCD': 'ФС', 'PSCD': 'ФС',
  
  // ДО - зеленая группа
  'PDO2': 'ДО', 'PDO1': 'ДО', 'PDO3': 'ДО',
  
  // МС - оранжевая группа
  'PCMC': 'МС', 'PMC2': 'МС', 'PMC1': 'МС', 'PPMC': 'МС',
  'P2MC': 'МС', 'PKMC': 'МС', 'PSC1': 'МС', 'PSCS': 'МС',
  'PSCM': 'МС', 'P2XC': 'МС', 'PSMC': 'МС',
  
  // М2 - голубая группа
  'PCM2': 'М2', 'PM22': 'М2', 'PM21': 'М2', 'P2M2': 'М2',
  'PSM2': 'М2', 'PKM2': 'М2', 'PPM2': 'М2',
  'PS2L': 'М2', 'PS2S': 'М2', 'PZM2': 'М2', 'PS2M': 'М2',
  
  // М3 - фиолетовая группа
  'PCM3': 'М3', 'PM32': 'М3', 'PM31': 'М3', 'PS3L': 'М3',
  'P2M3': 'М3', 'PSM3': 'М3', 'PS3S': 'М3', 'PKM3': 'М3', 
  'PS3M': 'М3', 'PPM3': 'М3',
  
  // М4 - серая группа
  'PCM4': 'М4', 'PM42': 'М4', 'PM44': 'М4', 'PM41': 'М4',
  'PPM4': 'М4', 'P2M4': 'М4', 'PSM4': 'М4', 'PS4L': 'М4', 
  'PS4S': 'М4', 'PS4M': 'М4', 'PZM4': 'М4', 'PKM4': 'М4',
  
  // М5 - светло-зеленая группа
  'PCM5': 'М5', 'PM52': 'М5', 'PM51': 'М5', 'PPMS': 'М5',
  'PS5L': 'М5', 'PS5S': 'М5', 'PS5M': 'М5', 'P2M5': 'М5',
  'PZM5': 'М5', 'PKM5': 'М5',
  
  // ПМ - Паллетный метод
  'DEF': 'ПМ',
};

async function checkMapping() {
  try {
    console.log('🔄 Подключение к БД...');
    await sql.connect(config);
    console.log('✅ Подключено\n');

    // Получить все склады из БД
    console.log('📦 СКЛАДЫ (warehouses):');
    console.log('='.repeat(80));
    const warehousesResult = await sql.query`
      SELECT code, name, is_active
      FROM warehouses
      ORDER BY code
    `;
    
    warehousesResult.recordset.forEach(wh => {
      const status = wh.is_active ? '✅' : '❌';
      console.log(`${status} ${wh.code.padEnd(10)} - ${wh.name}`);
    });

    // Группировка SAP кодов по складам
    console.log('\n\n📊 МАППИНГ SAP КОДОВ → СКЛАДЫ:');
    console.log('='.repeat(80));
    
    const groupedBySklad = {};
    Object.entries(mapping).forEach(([sapCode, skladCode]) => {
      if (!groupedBySklad[skladCode]) {
        groupedBySklad[skladCode] = [];
      }
      groupedBySklad[skladCode].push(sapCode);
    });

    Object.entries(groupedBySklad).sort().forEach(([skladCode, sapCodes]) => {
      const warehouse = warehousesResult.recordset.find(w => w.code === skladCode);
      const status = warehouse ? (warehouse.is_active ? '✅' : '⚠️ ') : '❌';
      const name = warehouse ? warehouse.name : 'НЕ НАЙДЕН В БД';
      
      console.log(`\n${status} ${skladCode} - ${name}`);
      console.log(`   SAP коды (${sapCodes.length}): ${sapCodes.join(', ')}`);
    });

    // Проверка тарифов
    console.log('\n\n💰 ТАРИФЫ (tariffs):');
    console.log('='.repeat(80));
    
    const tariffsResult = await sql.query`
      SELECT 
        warehouse_code,
        operation_type,
        rate,
        is_active,
        valid_from,
        valid_to
      FROM tariffs
      WHERE is_active = 1
      ORDER BY warehouse_code, operation_type
    `;

    const tariffsByWarehouse = {};
    tariffsResult.recordset.forEach(t => {
      if (!tariffsByWarehouse[t.warehouse_code]) {
        tariffsByWarehouse[t.warehouse_code] = [];
      }
      tariffsByWarehouse[t.warehouse_code].push(t);
    });

    Object.entries(tariffsByWarehouse).sort().forEach(([whCode, tariffs]) => {
      console.log(`\n📍 ${whCode}:`);
      tariffs.forEach(t => {
        const validTo = t.valid_to ? t.valid_to.toISOString().split('T')[0] : 'бессрочно';
        console.log(`   ${t.operation_type.padEnd(20)} - ${t.rate.toFixed(2)} руб. (с ${t.valid_from.toISOString().split('T')[0]} до ${validTo})`);
      });
    });

    // Проверка: есть ли склады в БД, которых нет в маппинге
    console.log('\n\n🔍 ПРОВЕРКА СООТВЕТСТВИЯ:');
    console.log('='.repeat(80));
    
    const mappedSkaldCodes = [...new Set(Object.values(mapping))];
    const dbWarehouseCodes = warehousesResult.recordset.map(w => w.code);
    
    const notInMapping = dbWarehouseCodes.filter(code => !mappedSkaldCodes.includes(code));
    const notInDB = mappedSkaldCodes.filter(code => !dbWarehouseCodes.includes(code));

    if (notInMapping.length > 0) {
      console.log('\n⚠️  Склады в БД, но НЕТ в маппинге SAP:');
      notInMapping.forEach(code => {
        const wh = warehousesResult.recordset.find(w => w.code === code);
        console.log(`   ${code} - ${wh.name}`);
      });
    } else {
      console.log('\n✅ Все склады из БД присутствуют в маппинге');
    }

    if (notInDB.length > 0) {
      console.log('\n❌ Склады в маппинге SAP, но НЕТ в БД:');
      notInDB.forEach(code => {
        console.log(`   ${code} (SAP коды: ${groupedBySklad[code].join(', ')})`);
      });
    } else {
      console.log('\n✅ Все склады из маппинга присутствуют в БД');
    }

    // Проверка: есть ли тарифы для всех складов
    console.log('\n\n💡 СКЛАДЫ БЕЗ ТАРИФОВ:');
    console.log('='.repeat(80));
    
    const warehousesWithoutTariffs = dbWarehouseCodes.filter(code => !tariffsByWarehouse[code]);
    if (warehousesWithoutTariffs.length > 0) {
      warehousesWithoutTariffs.forEach(code => {
        const wh = warehousesResult.recordset.find(w => w.code === code);
        console.log(`⚠️  ${code} - ${wh.name}`);
      });
    } else {
      console.log('✅ Все склады имеют тарифы');
    }

    await sql.close();
    console.log('\n\n✅ Готово!');
  } catch (err) {
    console.error('❌ Ошибка:', err);
  }
}

checkMapping();
