const axios = require('axios');

// Тестовый запрос к SAP (как в примере пользователя)
async function testSapRequest() {
  console.log('🧪 Тестирование одного запроса к SAP...\n');

  const baseUrl = 'http://dwm-app.komus.net:8001/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV';
  
  // Пример из требований
  const filter = `(Lgnum eq '0SK2' and (ConfirmedDate ge datetime'2025-09-25T00:00:00' and ConfirmedDate le datetime'2026-01-20T23:59:59'))`;
  const url = `${baseUrl}/WHOSet?$filter=${filter}`;

  console.log('📡 URL:', url);
  console.log('');

  try {
    // Запрос БЕЗ авторизации (для проверки нужна ли она)
    console.log('1️⃣ Попытка БЕЗ авторизации...');
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      }
    });

    console.log('✅ Успех! Авторизация не требуется');
    console.log('📊 Получено записей:', response.data?.d?.results?.length || 0);
    
    if (response.data?.d?.results?.length > 0) {
      console.log('\n📋 Пример первой записи:');
      console.log(JSON.stringify(response.data.d.results[0], null, 2));
    }

  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ Требуется авторизация (401)');
      console.log('💡 Укажите SAP_USERNAME и SAP_PASSWORD в .env');
    } else if (error.response?.status === 400) {
      console.log('❌ Неправильный запрос (400)');
      console.log('📄 Детали ошибки:', error.response?.data);
    } else {
      console.log('❌ Ошибка:', error.message);
      if (error.response) {
        console.log('   Статус:', error.response.status);
        console.log('   Данные:', error.response.data);
      }
    }
  }

  console.log('\n---\n');

  // Тест С авторизацией (если указаны учетные данные)
  try {
    console.log('2️⃣ Попытка С авторизацией...');
    console.log('⚠️  Укажите учетные данные ниже:');
    
    const username = 'TEST_19238';  // ❗ Замените
    const password = 'TEST_19238_qa';  // ❗ Замените

    if (username === 'your_username') {
      console.log('⏭️  Пропускаем (не указаны учетные данные)');
      return;
    }

    const authResponse = await axios.get(url, {
      auth: { username, password },
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      }
    });

    console.log('✅ Успех с авторизацией!');
    console.log('📊 Получено записей:', authResponse.data?.d?.results?.length || 0);

    if (authResponse.data?.d?.results?.length > 0) {
      console.log('\n📋 Пример первой записи из SAP:');
      const firstRecord = authResponse.data.d.results[0];
      console.log('  Employeeid:', firstRecord.Employeeid);
      console.log('  Lgnum:', firstRecord.Lgnum);
      console.log('  ActivityType:', firstRecord.ActivityType);
      console.log('  ConfirmedQuantity:', firstRecord.ConfirmedQuantity);
      console.log('  ConfirmedDate:', firstRecord.ConfirmedDate);
      console.log('  Who (Order ID):', firstRecord.Who);
      console.log('\n📄 Полная запись:');
      console.log(JSON.stringify(firstRecord, null, 2));
    }

  } catch (error) {
    console.log('❌ Ошибка с авторизацией:', error.message);
    if (error.response) {
      console.log('   Статус:', error.response.status);
      console.log('   Детали:', error.response.data);
    }
  }
}

testSapRequest();
