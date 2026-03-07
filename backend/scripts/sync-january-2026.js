/**
 * Скрипт для ручного запуска синхронизации с SAP за январь 2026
 */

const axios = require('axios');
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

const axiosInstance = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: {
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD
  },
  timeout: 120000,
  proxy: false  // Отключаем прокси
});

// Маппинг WCR -> Полный тип операции (Участок + Тип) из изображения
const WCR_TO_FULL_OPERATION = {
  // ФС Коробочная комплектация (желтый)
  'PCST': 'ФС Коробочная комплектация',
  'PST2': 'ФС Коробочная комплектация',
  'PST1': 'ФС Коробочная комплектация',
  'PST3': 'ФС Коробочная комплектация',
  'PSST': 'ФС Коробочная комплектация',
  
  // ФС Штучная комплектация (желтый)
  'PM12': 'ФС Штучная комплектация',
  'PM13': 'ФС Штучная комплектация',
  'PS1S': 'ФС Штучная комплектация',
  'PS01': 'ФС Штучная комплектация',
  
  // ДО Коробочная комплектация (зеленый)
  'PCD1': 'ДО Коробочная комплектация',
  'PSCD': 'ДО Коробочная комплектация',
  
  // ДО Штучная комплектация (зеленый)
  'PDO1': 'ДО Штучная комплектация',
  'PDO3': 'ДО Штучная комплектация',
  
  // МС Коробочная комплектация (оранжевый)
  'PCMC': 'МС Коробочная комплектация',
  'PMC1': 'МС Коробочная комплектация',
  'PMC2': 'МС Коробочная комплектация',
  'PPMC': 'МС Коробочная комплектация',
  
  // МС Штучная комплектация (оранжевый)
  'PS5S': 'МС Штучная комплектация',
  'PSC9': 'МС Штучная комплектация',
  
  // МС Упаковка (оранжевый)
  'PAMC': 'МС Упаковка',
  
  // М2 Коробочная комплектация (серый)
  'PCM2': 'М2 Коробочная комплектация',
  'PM22': 'М2 Коробочная комплектация',
  
  // М2 Штучная комплектация (серый)
  'PS2L': 'М2 Штучная комплектация',
  'PM2Z': 'М2 Штучная комплектация',
  
  // М2 Упаковка (серый)
  'PAM2': 'М2 Упаковка',
  
  // М2 Штучн.компл.однострочн (серый)
  'PPM2': 'М2 Штучн.компл.однострочн',
  'PS2S': 'М2 Штучн.компл.однострочн',
  
  // М3 Коробочная комплектация (фиолетовый)
  'PCM3': 'М3 Коробочная комплектация',
  'PM31': 'М3 Коробочная комплектация',
  'PM33': 'М3 Коробочная комплектация',
  'PM3S': 'М3 Коробочная комплектация',
  
  // М3 Штучная комплектация (фиолетовый)
  'PS3S': 'М3 Штучная комплектация',
  'PM3Z': 'М3 Штучная комплектация',
  
  // М3 Штучн.компл.однострочн (фиолетовый)
  'PPM3': 'М3 Штучн.компл.однострочн',
  'PS3M': 'М3 Штучн.компл.однострочн',
  
  // М4 Коробочная комплектация (розовый)
  'PCM4': 'М4 Коробочная комплектация',
  'PM42': 'М4 Коробочная комплектация',
  'PM41': 'М4 Коробочная комплектация',
  
  // М4 Штучная комплектация (розовый)
  'PS4L': 'М4 Штучная комплектация',
  'PS4S': 'М4 Штучная комплектация',
  'PS4M': 'М4 Штучная комплектация',
  
  // М4 Штучн.компл.однострочн (розовый)
  'PPM4': 'М4 Штучн.компл.однострочн',
  
  // М4 Упаковка (розовый)
  'PAM4': 'М4 Упаковка',
  
  // М5 Коробочная комплектация (зеленый)
  'PCM5': 'М5 Коробочная комплектация',
  'PM51': 'М5 Коробочная комплектация',
  'PM53': 'М5 Коробочная комплектация',
  
  // М5 Штучная комплектация (зеленый)
  'PS5L': 'М5 Штучная комплектация',
  'PS5M': 'М5 Штучная комплектация',
  'PS5U': 'М5 Штучная комплектация',
  
  // М5 Штучн.компл.однострочн (зеленый)
  'PPM5': 'М5 Штучн.компл.однострочн',
  
  // М5 Упаковка (зеленый)
  'PAM5': 'М5 Упаковка',
  
  // ПМ Упаковка (желтый внизу)
  'DEF': 'ПМ Упаковка',
};

async function syncJanuary2026() {
  let pool;
  
  try {
    console.log('🔄 СИНХРОНИЗАЦИЯ С SAP ЗА ЯНВАРЬ 2026\n');
    console.log('='.repeat(70));
    console.log(`📡 SAP URL: ${process.env.SAP_ODATA_BASE_URL}`);
    console.log(`👤 SAP User: ${process.env.SAP_USERNAME}`);
    console.log('='.repeat(70) + '\n');
    
    // Подключаемся к БД
    pool = await sql.connect(dbConfig);
    console.log('✅ Подключено к БД\n');
    
    // Получаем список активных складов
    const warehousesQuery = `SELECT code, name FROM warehouses WHERE is_active = 1`;
    const warehouses = await pool.query(warehousesQuery);
    console.log(`📦 Активных складов: ${warehouses.recordset.length}\n`);
    
    // Даты синхронизации: январь 2026
    const startDate = new Date(2026, 0, 1, 0, 0, 0, 0);      // 1 января 2026
    const endDate   = new Date(2026, 0, 31, 23, 59, 59, 999); // 31 января 2026
    
    const formatDate = (date) => date.toISOString().split('.')[0];
    
    console.log(`📅 Период: ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}\n`);
    
    let totalOperations = 0;
    let totalSaved = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let newUsers = 0;
    
    // Обрабатываем каждый склад
    for (const warehouse of warehouses.recordset) {
      try {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📦 Склад: ${warehouse.code} (${warehouse.name})`);
        console.log('='.repeat(70));
        
        const filter = `$filter=(Lgnum eq '${warehouse.code}' and (ConfirmedDate ge datetime'${formatDate(startDate)}' and ConfirmedDate le datetime'${formatDate(endDate)}'))`;
        const url = `/WHOSet?${filter}`;
        
        console.log(`🔍 Запрос к SAP...`);
        const response = await axiosInstance.get(url);
        const results = response.data?.d?.results || [];
        
        console.log(`📊 Получено записей: ${results.length}`);
        totalOperations += results.length;
        
        if (results.length === 0) {
          console.log('⚠️ Нет данных для этого склада');
          continue;
        }
        
        // Выводим первую запись для отладки (только для первого склада)
        if (results.length > 0 && warehouse.code === warehouses.recordset[0].code) {
          console.log('\n📝 Пример записи из SAP:');
          const sample = results[0];
          console.log(`   Queue: "${sample.Queue}"`);
          console.log(`   Wcr: "${sample.Wcr}"`);
          console.log(`   Lgnum: "${sample.Lgnum}"`);
          console.log(`   Employeeid: "${sample.Employeeid}"`);
          console.log(`   McName1: "${sample.McName1}"`);
          console.log(`   McName2: "${sample.McName2}"`);
          console.log(`   ConfirmedDate: "${sample.ConfirmedDate}"`);
          console.log(`   Actdura: "${sample.Actdura}"`);
          console.log(`   ZsumAmountItm (АЕИ): "${sample.ZsumAmountItm}"`);
          console.log(`   Who: "${sample.Who}"\n`);
        }
        
        // Обрабатываем каждую операцию
        for (const item of results) {
          try {
            const employeeId = item.Employeeid || item.Processor;
            const lastName = (item.McName1 || '').trim();
            const firstName = (item.McName2 || '').trim();
            const warehouseCode = item.Lgnum;
            const wcr = item.Wcr;
            
            // Определяем полный тип операции из WCR (Участок + Тип)
            const operationType = WCR_TO_FULL_OPERATION[wcr];
            if (!operationType) {
              // Пропускаем неизвестные WCR (служебные операции)
              totalSkipped++;
              continue;
            }
            
            // Парсинг даты из формата /Date(timestamp)/
            let operationDate = new Date();
            if (item.ConfirmedDate) {
              const timestamp = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
              if (timestamp) {
                operationDate = new Date(parseInt(timestamp[1], 10));
              }
            }
            
            // Получаем АЕИ из поля ZsumAmountItm
            const aeiCount = parseFloat(item.ZsumAmountItm || 0);
            
            // Пропускаем записи где АЕИ = 0 (записываем только где больше 0)
            if (aeiCount <= 0) {
              totalSkipped++;
              continue;
            }
            
            // Фактическое время в минутах (для справки)
            const actduraMinutes = parseFloat(item.Actdura || 0);
            
            // Проверяем существует ли пользователь
            let user = await pool.query`
              SELECT id FROM users WHERE employee_id = ${employeeId}
            `;
            
            // Если пользователь не найден - создаем
            if (user.recordset.length === 0) {
              const warehouseRecord = await pool.query`
                SELECT id FROM warehouses WHERE code = ${warehouseCode}
              `;
              
              if (warehouseRecord.recordset.length > 0) {
                const fio = `${lastName} ${firstName}`.trim() || `Сотрудник ${employeeId}`;
                
                await pool.query`
                  INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
                  VALUES (${employeeId}, ${fio}, ${warehouseRecord.recordset[0].id}, 'employee', 1)
                `;
                
                newUsers++;
                if (newUsers <= 10) {
                  console.log(`  ✅ Создан новый пользователь: ${employeeId} (${fio})`);
                }
                
                // Повторно получаем пользователя
                user = await pool.query`
                  SELECT id FROM users WHERE employee_id = ${employeeId}
                `;
              } else {
                console.log(`  ⚠️ Склад не найден: ${warehouseCode}, пропускаем операцию`);
                totalSkipped++;
                continue;
              }
            }
            
            const userId = user.recordset[0].id;
            
            // Проверяем существует ли операция
            const existingOp = await pool.query`
              SELECT id FROM operations 
              WHERE user_id = ${userId} 
                AND operation_date = ${operationDate}
                AND operation_type = ${operationType}
                AND sap_order_id = ${item.Who || null}
            `;
            
            if (existingOp.recordset.length > 0) {
              totalSkipped++;
              continue;
            }
            
            // Сохраняем операцию
            await pool.query`
              INSERT INTO operations (
                user_id, operation_type, operation_date, 
                actdura, count, sap_order_id, warehouse_code
              )
              VALUES (
                ${userId}, ${operationType}, ${operationDate},
                ${actduraMinutes}, ${aeiCount}, ${item.Who || null}, ${warehouseCode}
              )
            `;
            
            totalSaved++;
            
          } catch (error) {
            console.error(`  ❌ Ошибка обработки операции: ${error.message}`);
            totalErrors++;
          }
        }
        
        console.log(`✅ Склад обработан`);
        
        // Небольшая задержка между складами
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Ошибка обработки склада ${warehouse.code}: ${error.message}`);
        totalErrors++;
      }
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 ИТОГОВАЯ СТАТИСТИКА:');
    console.log('='.repeat(70));
    console.log(`📥 Всего получено операций: ${totalOperations}`);
    console.log(`✅ Сохранено: ${totalSaved}`);
    console.log(`⏭️  Пропущено (дубликаты): ${totalSkipped}`);
    console.log(`❌ Ошибок: ${totalErrors}`);
    console.log(`👤 Создано новых пользователей: ${newUsers}`);
    console.log('='.repeat(70));
    
    await pool.close();
    console.log('\n✅ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА!\n');
    
  } catch (err) {
    console.error('\n❌ Критическая ошибка:', err.message);
    console.error(err.stack);
    if (pool) await pool.close();
    process.exit(1);
  }
}

syncJanuary2026();
