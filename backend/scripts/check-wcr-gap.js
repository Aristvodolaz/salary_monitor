const sql = require('mssql');
const config = { server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587, user: 'sa', password: 'icY2eGuyfU', database: 'SalaryMonitor', options: { encrypt: false, trustServerCertificate: true } };

async function main() {
  const pool = await sql.connect(config);
  
  // 1. WCR from DB
  const wcrDb = await pool.request().query('SELECT wcr_code, operation_type FROM wcr_mapping WHERE is_active = 1 ORDER BY wcr_code');
  console.log('=== WCR FROM DB (' + wcrDb.recordset.length + ') ===');
  wcrDb.recordset.forEach(r => console.log('  ' + r.wcr_code + ' -> ' + r.operation_type));
  
  // 2. Tariffs with rate=0
  const zeroTariffs = await pool.request().query('SELECT operation_type, rate FROM tariffs WHERE is_active = 1 AND rate = 0');
  console.log('\n=== TARIFFS WITH rate=0 ===');
  zeroTariffs.recordset.forEach(r => console.log('  ' + r.operation_type + ': ' + r.rate));

  // 3. What operation types from WCR lack tariffs?
  const missing = await pool.request().query(`
    SELECT DISTINCT wm.operation_type 
    FROM wcr_mapping wm
    WHERE wm.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM tariffs t 
        WHERE t.operation_type = wm.operation_type 
          AND t.is_active = 1 
          AND t.rate > 0
      )
  `);
  console.log('\n=== OPERATION TYPES IN WCR_MAPPING WITH NO TARIFF (rate>0) ===');
  missing.recordset.forEach(r => console.log('  ' + r.operation_type));

  // 4. WCR codes from hardcoded map NOT in DB
  const hardcoded = {
    'PCST':'ФС Коробочная комплектация','PST2':'ФС Коробочная комплектация','PST1':'ФС Коробочная комплектация',
    'PST3':'ФС Коробочная комплектация','PSST':'ФС Коробочная комплектация',
    'PM12':'ФС Штучная комплектация','PM13':'ФС Штучная комплектация','PS1S':'ФС Штучная комплектация','PS01':'ФС Штучная комплектация',
    'PCD1':'ДО Коробочная комплектация','PSCD':'ДО Коробочная комплектация',
    'PDO1':'ДО Штучная комплектация','PDO3':'ДО Штучная комплектация',
    'PCMC':'МС Коробочная комплектация','PMC1':'МС Коробочная комплектация','PMC2':'МС Коробочная комплектация',
    'PPMC':'МС Штучн.компл.однострочн',
    'PS5S':'МС Штучная комплектация','PSC9':'МС Штучная комплектация',
    'PAMC':'МС Упаковка',
    'PCM2':'М2 Коробочная комплектация','PM22':'М2 Коробочная комплектация',
    'PS2L':'М2 Штучная комплектация','PM2Z':'М2 Штучная комплектация',
    'PAM2':'М2 Упаковка',
    'PPM2':'М2 Штучн.компл.однострочн','PS2S':'М2 Штучн.компл.однострочн',
    'PCM3':'М3 Коробочная комплектация','PM31':'М3 Коробочная комплектация','PM33':'М3 Коробочная комплектация','PM3S':'М3 Коробочная комплектация',
    'PS3S':'М3 Штучная комплектация','PM3Z':'М3 Штучная комплектация',
    'PPM3':'М3 Штучн.компл.однострочн','PS3M':'М3 Штучн.компл.однострочн',
    'PCM4':'М4 Коробочная комплектация','PM42':'М4 Коробочная комплектация','PM41':'М4 Коробочная комплектация',
    'PS4L':'М4 Штучная комплектация','PS4S':'М4 Штучная комплектация','PS4M':'М4 Штучная комплектация',
    'PPM4':'М4 Штучн.компл.однострочн',
    'PAM4':'М4 Упаковка',
    'PCM5':'М5 Коробочная комплектация','PM51':'М5 Коробочная комплектация','PM53':'М5 Коробочная комплектация',
    'PS5L':'М5 Штучная комплектация','PS5M':'М5 Штучная комплектация','PS5U':'М5 Штучная комплектация',
    'PPM5':'М5 Штучн.компл.однострочн',
    'PAM5':'М5 Упаковка',
    'DEF':'ПМ Упаковка'
  };

  const dbWcrSet = new Set(wcrDb.recordset.map(r => r.wcr_code));
  const hardcodedWcrs = Object.keys(hardcoded);
  const missingFromDb = hardcodedWcrs.filter(w => !dbWcrSet.has(w));
  
  console.log('\n=== WCR CODES IN HARDCODED MAP BUT NOT IN DB (' + missingFromDb.length + ') ===');
  missingFromDb.forEach(w => console.log('  ' + w + ' -> ' + hardcoded[w]));

  // 5. DB WCR codes NOT in hardcoded map
  const hardcodedSet = new Set(hardcodedWcrs);
  const extraInDb = wcrDb.recordset.filter(r => !hardcodedSet.has(r.wcr_code));
  console.log('\n=== WCR CODES IN DB BUT NOT IN HARDCODED MAP (' + extraInDb.length + ') ===');
  extraInDb.forEach(r => console.log('  ' + r.wcr_code + ' -> ' + r.operation_type));

  // 6. Full list of operation types with ALL their tariff rates
  const allTariffs = await pool.request().query('SELECT operation_type, rate FROM tariffs WHERE is_active = 1 ORDER BY operation_type');
  console.log('\n=== ALL TARIFFS ===');
  allTariffs.recordset.forEach(r => console.log('  ' + r.operation_type + ': ' + r.rate));

  await pool.close();
}
main();
