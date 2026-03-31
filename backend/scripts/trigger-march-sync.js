/**
 * Триггер повторной синхронизации марта через API
 * Запускает sync через HTTP API (если SAP доступен)
 */
const http = require('http');
const sql  = require('mssql');

const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

// Получаем JWT токен через DB (обходим HTTP auth)
// Вместо этого — напрямую через sap sync скрипт
async function main() {
  console.log('Проверяем доступность SAP...');

  const axios = require('axios');
  const resp = await axios.get(
    'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV/WHOSet' +
    '?$filter=(Lgnum eq \'02DQ\' and (ConfirmedDate ge datetime\'2026-03-29T00:00:00\' and ConfirmedDate le datetime\'2026-03-29T23:59:59\'))' +
    '&$top=5&$select=Who,Wcr,Aarea,ZsumAmountItm,ConfirmedDate&$format=json',
    {
      auth: { username: 'SALAR_TO_PWM', password: '9pVQMGLC' },
      timeout: 30000,
    }
  ).catch(e => ({ data: { d: { results: [] } }, error: e.message }));

  const items = resp.data?.d?.results || [];
  if (items.length > 0) {
    console.log(`✅ SAP ДОСТУПЕН! Получено ${items.length} записей. Пример:`);
    console.log('  Wcr:', items[0].Wcr, '| Aarea:', items[0].Aarea, '| ZsumAmountItm:', items[0].ZsumAmountItm);
    console.log('\nВыполните: node scripts\\sync-march-2026.js');
  } else {
    console.log('❌ SAP недоступен в данный момент (0 записей). Попробуйте позже.');
    console.log('   Обычно данные доступны с 23:00 до 8:00 по московскому времени.');
  }

  process.exit(0);
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
