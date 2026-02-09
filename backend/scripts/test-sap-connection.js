#!/usr/bin/env node
/**
 * Скрипт для тестирования подключения к SAP серверу
 * Проверяет доступность сервера и выводит детальную диагностику
 */

require('dotenv').config();
const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');

const SAP_BASE_URL = process.env.SAP_ODATA_BASE_URL;
const SAP_USERNAME = process.env.SAP_USERNAME;
const SAP_PASSWORD = process.env.SAP_PASSWORD;

// Парсим URL
const url = new URL(SAP_BASE_URL);
const hostname = url.hostname;
const port = url.port || 80;

console.log('🔍 ДИАГНОСТИКА ПОДКЛЮЧЕНИЯ К SAP\n');
console.log(`📋 Параметры:`);
console.log(`   URL: ${SAP_BASE_URL}`);
console.log(`   Host: ${hostname}`);
console.log(`   Port: ${port}`);
console.log(`   User: ${SAP_USERNAME}`);
console.log(`\n${'━'.repeat(50)}\n`);

async function testDNS() {
  console.log('1️⃣ Проверка DNS...');
  try {
    const addresses = await dns.resolve4(hostname);
    console.log(`   ✅ DNS резолвится в: ${addresses.join(', ')}`);
    return addresses[0];
  } catch (error) {
    console.log(`   ❌ DNS ошибка: ${error.message}`);
    return null;
  }
}

async function testTCP(ip, port) {
  console.log(`\n2️⃣ Проверка TCP подключения к ${ip}:${port}...`);
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 10000; // 10 секунд
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      console.log(`   ✅ TCP подключение успешно`);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      console.log(`   ⏱️ Таймаут (${timeout}ms) - сервер не отвечает`);
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', (error) => {
      if (error.code === 'ETIMEDOUT') {
        console.log(`   ❌ ETIMEDOUT - сервер недоступен`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   ❌ ECONNREFUSED - соединение отклонено (порт закрыт)`);
      } else {
        console.log(`   ❌ Ошибка: ${error.code} - ${error.message}`);
      }
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

async function testHTTP() {
  console.log(`\n3️⃣ Проверка HTTP подключения...`);
  
  try {
    const axiosInstance = axios.create({
      baseURL: SAP_BASE_URL,
      auth: {
        username: SAP_USERNAME,
        password: SAP_PASSWORD,
      },
      timeout: 30000, // 30 секунд
    });
    
    const response = await axiosInstance.get('/');
    console.log(`   ✅ HTTP ответ: ${response.status} ${response.statusText}`);
    return true;
  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      console.log(`   ❌ ETIMEDOUT - таймаут HTTP запроса`);
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`   ❌ ECONNREFUSED - HTTP соединение отклонено`);
    } else if (error.response) {
      console.log(`   ⚠️ HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.status === 401) {
        console.log(`   ℹ️ Это нормально - требуется авторизация`);
      }
      return true; // Сервер отвечает, это хорошо
    } else {
      console.log(`   ❌ Ошибка: ${error.code || error.message}`);
    }
    return false;
  }
}

async function testOData() {
  console.log(`\n4️⃣ Проверка OData endpoint...`);
  
  try {
    const axiosInstance = axios.create({
      baseURL: SAP_BASE_URL,
      auth: {
        username: SAP_USERNAME,
        password: SAP_PASSWORD,
      },
      timeout: 30000,
    });
    
    // Пробуем получить метаданные
    const response = await axiosInstance.get('/$metadata');
    console.log(`   ✅ OData метаданные доступны: ${response.status}`);
    return true;
  } catch (error) {
    if (error.response) {
      console.log(`   ⚠️ HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.status === 401) {
        console.log(`   ❌ Неверные учетные данные`);
      }
    } else {
      console.log(`   ❌ Ошибка: ${error.code || error.message}`);
    }
    return false;
  }
}

async function main() {
  // Шаг 1: DNS
  const ip = await testDNS();
  if (!ip) {
    console.log('\n❌ Не удалось резолвить DNS. Дальнейшая проверка невозможна.');
    process.exit(1);
  }
  
  // Шаг 2: TCP
  const tcpOk = await testTCP(ip, port);
  if (!tcpOk) {
    console.log('\n❌ TCP подключение не удалось.');
    console.log('\n💡 ВОЗМОЖНЫЕ ПРИЧИНЫ:');
    console.log('   1. SAP сервер недоступен из вашей сети');
    console.log('   2. Firewall блокирует порт 80');
    console.log('   3. SAP сервер выключен');
    console.log('   4. Нужно настроить VPN или прокси');
    console.log('\n💡 РЕШЕНИЕ:');
    console.log('   - Проверьте доступность сервера командой: ping pwm.komus.net');
    console.log('   - Проверьте порт: telnet pwm.komus.net 80');
    console.log('   - Свяжитесь с IT отделом для настройки доступа');
    process.exit(1);
  }
  
  // Шаг 3: HTTP
  const httpOk = await testHTTP();
  
  // Шаг 4: OData
  const odataOk = await testOData();
  
  console.log(`\n${'━'.repeat(50)}\n`);
  console.log('📊 РЕЗУЛЬТАТЫ:');
  console.log(`   DNS:   ${ip ? '✅' : '❌'}`);
  console.log(`   TCP:   ${tcpOk ? '✅' : '❌'}`);
  console.log(`   HTTP:  ${httpOk ? '✅' : '❌'}`);
  console.log(`   OData: ${odataOk ? '✅' : '❌'}`);
  
  if (tcpOk && httpOk && odataOk) {
    console.log('\n✅ Все проверки пройдены! SAP сервер доступен.');
  } else {
    console.log('\n❌ Обнаружены проблемы с подключением к SAP серверу.');
  }
}

main().catch(console.error);
