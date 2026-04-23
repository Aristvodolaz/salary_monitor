const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');

const cfg = {
  server: 'PRM-SRV-MSSQL-01.komus.net', port: 59587,
  database: 'SalaryMonitor', user: 'sa', password: 'icY2eGuyfU',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 120000,
};

// Все P* коды из Excel с их ставками
const excelPicking = {
  'PCST':5.9,'PST2':5.9,'PSTT':5.9,'PST1':5.9,'PST3':5.9,
  'PZST':2.8,'PSST':2.8,'PCM1':5.9,'PM12':5.9,'PM11':5.9,'PM13':5.9,
  'PS1L':2.8,'PS1S':2.8,'PS1M':2.8,'PSM1':2.8,
  'PCCD':5.9,'PCD2':5.9,'PCD1':5.9,'PZCD':2.8,'PSCD':2.8,
  'PDO2':7.1,'PDO1':7.1,'PDO3':7.1,
  'PCMC':5.4,'PMC2':5.4,'PMC1':5.4,'PPMC':3.2,'P2MC':1.6,'PKMC':1.7,
  'PSCL':1.6,'PSCS':1.6,'PSCM':1.6,'P2XC':1.6,'PSMC':1.6,
  'PCM2':15.3,'PM22':15.3,'PM21':15.3,'P2M2':1.4,'PSM2':1.4,'PKM2':1.4,
  'PPM2':2.0,'PS2L':15.3,'PS2S':15.3,'PZM2':1.4,'PS2M':15.3,
  'PCM3':5.4,'PM32':5.4,'PM31':5.4,'PS3L':6.8,'P2M3':6.8,'PSM3':6.8,
  'PS3S':6.8,'PKM3':null,'PS3M':6.8,'PPM3':10.4,
  'PCM4':5.4,'PM42':5.4,'PMT4':5.4,'PM41':5.4,'PPM4':2.4,'P2M4':1.4,
  'PSM4':1.4,'PS4L':1.4,'PS4S':1.4,'PS4M':1.4,'PZM4':1.4,'PKM4':1.5,
  'PCM5':5.4,'PM52':5.4,'PM51':5.4,'PPM5':1.4,'PS5L':1.1,'PS5S':1.1,
  'PS5M':1.1,'P2M5':1.1,'PKM5':1.2,'PZM5':1.1,'PSM5':1.1,
  'DEF':4.1
};

// АЕИ коды из Excel — wcr_code → operation_type (new description) + rate
const excelAEI = [
  { wcr: 'INB_CD',      opType: 'Пополнение М1',  rate: 20.8 },
  { wcr: 'INB_MC01',    opType: 'Пополнение КС',   rate: 17.2 },
  { wcr: 'INB_MZ01',    opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'INB_MZ02',    opType: 'Пополнение М2',   rate: 12.3 },
  { wcr: 'INB_MZ03',    opType: 'Пополнение М3',   rate: 12.3 },
  { wcr: 'INB_MZ04',    opType: 'Пополнение М4',   rate: 9.4  },
  { wcr: 'INB_MZ05',    opType: 'Пополнение М5',   rate: 12.3 },
  { wcr: 'INB_SP01',    opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'INB_SPTK',    opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'INT_BSCD',    opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'INT_MC01',    opType: 'Пополнение КС',   rate: 17.2 },
  { wcr: 'INT_MZ01',    opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'INT_MZ02',    opType: 'Пополнение М2',   rate: 12.3 },
  { wcr: 'INT_MZ03',    opType: 'Пополнение М3',   rate: 12.3 },
  { wcr: 'INT_MZ04',    opType: 'Пополнение М4',   rate: 9.4  },
  { wcr: 'INT_MZ05',    opType: 'Пополнение М5',   rate: 12.3 },
  { wcr: 'INT_PSST',    opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPL_BRS1',   opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPL_BRS2',   opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPL_BRST',   opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPL_MC01',   opType: 'Пополнение КС',   rate: 17.2 },
  { wcr: 'REPL_MZ01',   opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPL_MZ02',   opType: 'Пополнение М2',   rate: 12.3 },
  { wcr: 'REPL_MZ03',   opType: 'Пополнение М3',   rate: 12.3 },
  { wcr: 'REPL_MZ04',   opType: 'Пополнение М4',   rate: 9.4  },
  { wcr: 'REPL_MZ05',   opType: 'Пополнение М5',   rate: 12.3 },
  { wcr: 'REPL_PSS1',   opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPLO_BRST',  opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPLO_MC01',  opType: 'Пополнение КС',   rate: 17.2 },
  { wcr: 'REPLO_MZ01',  opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'REPLO_MZ02',  opType: 'Пополнение М2',   rate: 12.3 },
  { wcr: 'REPLO_MZ03',  opType: 'Пополнение М3',   rate: 12.3 },
  { wcr: 'REPLO_MZ04',  opType: 'Пополнение М4',   rate: 9.4  },
  { wcr: 'REPLO_MZ05',  opType: 'Пополнение М5',   rate: 12.3 },
  { wcr: 'RPL_BRSTT',   opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'RPLO_BRSTT',  opType: 'Пополнение М1',   rate: 20.8 },
  { wcr: 'INV_BSCD',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_MC01',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_MZ01',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_MZ02',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_MZ03',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_MZ04',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_MZ05',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_PBST',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_PSST',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'INV_SPST',    opType: 'Инвентаризация',  rate: 3.9  },
  { wcr: 'UNLOAD',      opType: 'Приемка товара',  rate: 20.8 },
];

async function main() {
  const pool = await sql.connect(cfg);
  console.log('✅ Подключено\n');

  // wcr_picking_norms
  const pick = await pool.request().query('SELECT wcr_code FROM wcr_picking_norms WHERE is_active=1');
  const inPick = new Set(pick.recordset.map(r => r.wcr_code));
  const excelPickCodes = Object.keys(excelPicking);
  const missingPick = excelPickCodes.filter(c => !inPick.has(c));
  console.log(`=== wcr_picking_norms: в БД ${inPick.size}, в Excel ${excelPickCodes.length} ===`);
  console.log(`Отсутствуют (${missingPick.length}): ${missingPick.join(', ')}`);

  // wcr_mapping
  const wm = await pool.request().query('SELECT wcr_code, operation_type FROM wcr_mapping WHERE is_active=1');
  const inMap = new Map(wm.recordset.map(r => [r.wcr_code, r.operation_type]));
  const missingAEI = excelAEI.filter(x => !inMap.has(x.wcr));
  const wrongOpType = excelAEI.filter(x => inMap.has(x.wcr) && inMap.get(x.wcr) !== x.opType);
  console.log(`\n=== wcr_mapping: в БД ${inMap.size} ===`);
  console.log(`Отсутствуют (${missingAEI.length}): ${missingAEI.map(x=>x.wcr).join(', ')}`);
  if (wrongOpType.length) {
    console.log(`Неверный operation_type (${wrongOpType.length}):`);
    wrongOpType.forEach(x => console.log(`  ${x.wcr}: в БД="${inMap.get(x.wcr)}", надо="${x.opType}"`));
  }

  // tariffs
  const tar = await pool.request().query('SELECT operation_type, rate FROM tariffs WHERE is_active=1 ORDER BY operation_type');
  const inTar = new Map(tar.recordset.map(r => [r.operation_type, r.rate]));
  const neededOpTypes = new Map();
  excelAEI.forEach(x => neededOpTypes.set(x.opType, x.rate));
  console.log(`\n=== tariffs: в БД ${tar.recordset.length} ===`);
  tar.recordset.forEach(r => console.log(`  "${r.operation_type}" => ${r.rate}`));
  const missingTariff = [...neededOpTypes.entries()].filter(([op]) => !inTar.has(op));
  console.log(`\nНет в tariffs (${missingTariff.length}): ${missingTariff.map(([op,r])=>op+'='+r).join(', ')}`);

  // March zero-amount
  const ops = await pool.request().query(`
    SELECT wcr_code, COUNT(*) cnt, SUM([count]) aei, SUM(ISNULL(prod_count,0)) prod
    FROM operations
    WHERE operation_date >= '2026-03-01' AND operation_date < '2026-04-01'
      AND ISNULL(amount,0)=0 AND wcr_code IS NOT NULL
      AND wcr_code NOT LIKE '%BRAK%' AND wcr_code NOT LIKE 'INT_BR%'
      AND wcr_code NOT LIKE 'INTW%' AND wcr_code NOT LIKE 'OUT_%'
    GROUP BY wcr_code ORDER BY cnt DESC
  `);
  console.log(`\n=== WCR с amount=0 в марте (${ops.recordset.length} кодов) ===`);
  ops.recordset.slice(0,30).forEach(r => {
    const inExcel = excelPickCodes.includes(r.wcr_code) || excelAEI.some(x=>x.wcr===r.wcr_code);
    console.log(`  ${r.wcr_code}: ${r.cnt} ops, aei=${r.aei}, prod=${r.prod} ${inExcel?'[IN EXCEL]':'[NOT IN EXCEL]'}`);
  });

  await pool.close();
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
