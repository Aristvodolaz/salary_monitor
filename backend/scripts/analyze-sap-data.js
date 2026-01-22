const axios = require('axios');

const sapConfig = {
  baseUrl: 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV',
  username: 'SALAR_TO_PWM',
  password: '9pVQMGLC',
};

async function analyzeSapData() {
  console.log('🔍 Анализ данных из SAP для настройки маппинга...\n');

  try {
    // Запрос за последний месяц для анализа разных типов операций
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    
    const filter = `(Lgnum eq '0SK9' and (ConfirmedDate ge datetime'${startDate.toISOString().split('.')[0]}' and ConfirmedDate le datetime'${endDate.toISOString().split('.')[0]}'))`;
    const url = `${sapConfig.baseUrl}/WHOSet?$filter=${filter}`;

    const response = await axios.get(url, {
      auth: { username: sapConfig.username, password: sapConfig.password },
      headers: { 'Accept': 'application/json' },
    });

    const records = response.data?.d?.results || [];
    console.log(`📊 Получено записей: ${records.length}\n`);

    // Группируем по Queue, Wcr, Type для анализа
    const stats = {};
    
    records.forEach(record => {
      const key = `Queue:${record.Queue} | Wcr:${record.Wcr} | Type:${record.Type} | HdrProcty:${record.HdrProcty}`;
      if (!stats[key]) {
        stats[key] = {
          count: 0,
          avgAEI: 0,
          totalAEI: 0,
          employeeIds: new Set(),
        };
      }
      stats[key].count++;
      stats[key].totalAEI += parseInt(record.ZsumAmountItm || 0, 10);
      stats[key].employeeIds.add(record.Employeeid);
    });

    // Выводим статистику
    console.log('📋 Уникальные комбинации полей:\n');
    
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20); // Топ-20

    sorted.forEach(([key, data]) => {
      const avgAEI = data.totalAEI / data.count;
      console.log(`${key}`);
      console.log(`   Операций: ${data.count} | Всего АЕИ: ${data.totalAEI} | Среднее АЕИ: ${avgAEI.toFixed(1)} | Сотрудников: ${data.employeeIds.size}`);
      console.log('');
    });

    // Уникальные Queue
    const uniqueQueues = [...new Set(records.map(r => r.Queue))].filter(Boolean);
    console.log('\n📌 Уникальные Queue:', uniqueQueues.join(', '));

    // Уникальные Wcr
    const uniqueWcr = [...new Set(records.map(r => r.Wcr))].filter(Boolean);
    console.log('📌 Уникальные Wcr:', uniqueWcr.join(', '));

    // Уникальные Type
    const uniqueTypes = [...new Set(records.map(r => r.Type))].filter(Boolean);
    console.log('📌 Уникальные Type:', uniqueTypes.join(', '));

    // Показываем пример полной записи
    if (records.length > 0) {
      console.log('\n📄 Пример полной записи (первая):');
      const example = records[0];
      console.log('  Employeeid:', example.Employeeid);
      console.log('  Queue:', example.Queue);
      console.log('  Wcr:', example.Wcr);
      console.log('  Type:', example.Type);
      console.log('  HdrProcty:', example.HdrProcty);
      console.log('  ZsumAmountItm:', example.ZsumAmountItm);
      console.log('  ConfirmedDate:', example.ConfirmedDate);
      console.log('  Processor:', example.Processor);
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

analyzeSapData();
