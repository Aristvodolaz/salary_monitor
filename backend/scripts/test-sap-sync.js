const axios = require('axios');

async function testSapSync() {
  console.log('🚀 Тестирование синхронизации с SAP...\n');

  try {
    // 1. Авторизация (получаем токен админа)
    console.log('1️⃣ Авторизация как админ...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/barcode', {
      employeeId: '00000099' // admin
    });
    
    const token = loginResponse.data.access_token;
    console.log('✅ Токен получен!\n');

    // 2. Запуск синхронизации
    console.log('2️⃣ Запуск синхронизации с SAP...');
    console.log('⏳ Это может занять несколько минут...\n');
    
    const syncResponse = await axios.post('http://localhost:3000/api/sap/sync', {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 0 // Без timeout
    });

    console.log('✅ Результат:', syncResponse.data);
    console.log('\n📊 Проверьте логи backend для деталей');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Убедитесь, что backend запущен: npm run start:dev');
    }
    
    if (error.response?.status === 401) {
      console.log('\n💡 Проблема с авторизацией. Проверьте пользователя 00000099 в БД');
    }
    
    if (error.message.includes('SAP')) {
      console.log('\n💡 Проверьте учетные данные SAP в файле .env:');
      console.log('   SAP_USERNAME=...');
      console.log('   SAP_PASSWORD=...');
    }
  }
}

testSapSync();
