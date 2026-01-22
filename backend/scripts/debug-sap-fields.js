const axios = require('axios');

async function debugSapFields() {
  console.log('🔬 Детальный анализ полей SAP...\n');

  const sapConfig = {
    baseUrl: 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV',
    username: 'SALAR_TO_PWM',
    password: '9pVQMGLC',
  };

  try {
    // Запрос вчерашнего дня для одного склада
    const filter = `(Lgnum eq '0SK2' and (ConfirmedDate ge datetime'2026-01-19T21:00:00' and ConfirmedDate le datetime'2026-01-20T20:59:59'))`;
    const url = `${sapConfig.baseUrl}/WHOSet?$filter=${filter}&$top=5`;  // Только 5 записей

    const response = await axios.get(url, {
      auth: { username: sapConfig.username, password: sapConfig.password },
      headers: { 'Accept': 'application/json' },
    });

    const records = response.data?.d?.results || [];
    console.log(`📊 Получено записей: ${records.length}\n`);

    if (records.length === 0) {
      console.log('❌ Нет данных за этот период');
      return;
    }

    // Показываем первую запись ПОЛНОСТЬЮ
    console.log('📋 Первая запись (все поля):\n');
    const first = records[0];
    
    // Группируем поля для удобства
    console.log('👤 Сотрудник:');
    console.log(`   Employeeid: "${first.Employeeid}"`);
    console.log(`   Processor: "${first.Processor}"`);
    console.log(`   ConfirmedBy: "${first.ConfirmedBy}"`);
    
    console.log('\n📦 Склад и операция:');
    console.log(`   Lgnum: "${first.Lgnum}"`);
    console.log(`   Wcr: "${first.Wcr}"`);
    console.log(`   Queue: "${first.Queue}"`);
    console.log(`   Type: "${first.Type}"`);
    console.log(`   HdrProcty: "${first.HdrProcty}"`);
    
    console.log('\n🔢 Количества:');
    console.log(`   CountTo: ${first.CountTo}`);
    console.log(`   ZsumAmountItm: ${first.ZsumAmountItm}`);
    console.log(`   ZprodWtItm: ${first.ZprodWtItm}`);
    
    console.log('\n📅 Даты:');
    console.log(`   ConfirmedDate: ${first.ConfirmedDate}`);
    console.log(`   CreatedDate: ${first.CreatedDate}`);
    
    console.log('\n⏱️ Время:');
    console.log(`   Actdura: ${first.Actdura} (фактическое)`);
    console.log(`   Plandura: ${first.Plandura} (плановое)`);
    
    console.log('\n📏 Физические параметры:');
    console.log(`   SumWeight: ${first.SumWeight} ${first.UnitW}`);
    console.log(`   SumVolum: ${first.SumVolum} ${first.UnitV}`);
    
    console.log('\n---\n');
    
    // Анализ какие поля ненулевые
    console.log('🔍 Поиск ненулевых числовых полей:\n');
    const numericFields = ['CountTo', 'ZsumAmountItm', 'ZprodWtItm', 'Actdura', 'Plandura', 'SumWeight', 'SumVolum'];
    
    records.forEach((rec, idx) => {
      if (idx < 5) {  // Первые 5
        console.log(`Запись ${idx + 1}:`);
        numericFields.forEach(field => {
          const val = parseFloat(rec[field]);
          if (val > 0) {
            console.log(`   ${field}: ${val}`);
          }
        });
        console.log('');
      }
    });

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      console.log('Статус:', error.response.status);
    }
  }
}

debugSapFields();
