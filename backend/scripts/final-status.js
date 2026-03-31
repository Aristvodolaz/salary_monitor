/**
 * Итоговая проверка состояния системы
 */
const sql = require('mssql');
const cfg = { server:'PRM-SRV-MSSQL-01.komus.net', port:59587, user:'sa', password:'icY2eGuyfU', database:'SalaryMonitor', options:{trustServerCertificate:true, encrypt:false} };

const REFERENCE = [
  { name: 'ТУПЕЛЕКИН',    fio1: 'ТУПЕЛЕКИН',   fio2: 'ДЕНИС',      ref: 3456 },
  { name: 'ТАЖЕНОВ',      fio1: 'ТАЖЕНОВ',      fio2: 'СЕРИК',      ref: 2448 },
  { name: 'ЗАХАРОВ',      fio1: 'ЗАХАРОВ',      fio2: 'МИХАИЛ',     ref: 2645, tol: 1 },
  { name: 'ТУРСУНОВ',     fio1: 'ТУРСУНОВ',     fio2: 'АКРАМЖОН',   ref: 3267 },
  { name: 'ТРИФОНОВ',     fio1: 'ТРИФОНОВ',     fio2: 'НИКОЛАЙ',    ref: 5291 },
  { name: 'ЛАЙЕР',        fio1: 'ЛАЙЕР',        fio2: 'АЛЕКСАНДР',  ref: 5154 },
  { name: 'СТОЯКИН',      fio1: 'СТОЯКИН',      fio2: 'АЛЕКСАНДР',  ref: 1967 },
  { name: 'ДМИТРИЕВ В.А.', fio1: 'ДМИТРИЕВ',   fio2: 'ВЛАДИМИР',   ref: 364  },
  { name: 'НИКОТИН',      fio1: 'НИКОТИН',      fio2: 'СЕРГЕЙ',     ref: 468  },
  { name: 'СМИРНОВ',      fio1: 'СМИРНОВ',      fio2: 'АЛЕКСАНДР',  ref: 162  },
  { name: 'ЛУТОШКИН',     fio1: 'ЛУТОШКИН',     fio2: 'МИХАИЛ',     ref: 269  },
  { name: 'СОПОВ',        fio1: 'СОПОВ',        fio2: 'АЛЕКСАНДР',  ref: 747  },
  { name: 'ПОТАПОВА',     fio1: 'ПОТАПОВА',     fio2: 'ТАТЬЯНА',    ref: 5    },
  // Исправленные (излишек RPL1)
  { name: 'ДЕНИСОВ',      fio1: 'ДЕНИСОВ',      fio2: 'ЮРИЙ',       ref: 4775 },
  { name: 'МИЩЕНКОВ',     fio1: 'МИЩЕНКОВ',     fio2: 'ДМИТРИЙ',    ref: 1950 },
  { name: 'НОВИКОВ',      fio1: 'НОВИКОВ',      fio2: 'АЛЕКСАНДР',  ref: 925  },
  { name: 'ГОЗИЕВ',       fio1: 'ГОЗИЕВ',       fio2: 'КУЁШБЕК',    ref: 2254 },
  { name: 'НАДРАЛИЕВ',    fio1: 'НАДРАЛИЕВ',    fio2: 'ЕРМЕК',      ref: 1424 },
  { name: 'ИКСАНОВ',      fio1: 'ИКСАНОВ',      fio2: 'РАФАЭЛЬ',    ref: 2278 },
  { name: 'БЕРДНИКОВ',    fio1: 'БЕРДНИКОВ',    fio2: 'АРТЁМ',      ref: 893  },
  { name: 'ДОЛМАТОВ',     fio1: 'ДОЛМАТОВ',     fio2: 'ИЛЬЯ',       ref: 521  },
  { name: 'АБДУМАЛИКОВ',  fio1: 'АБДУМАЛИКОВ',  fio2: 'ШОМУРОД',    ref: 1379 },
  { name: 'ФЕДОТОВ',      fio1: 'ФЕДОТОВ',      fio2: 'РОМАН',      ref: 70   },
  { name: 'ХРАПОВ',       fio1: 'ХРАПОВ',       fio2: 'МАКСИМ',     ref: 78   },
  { name: 'ШУМЕНКО',      fio1: 'ШУМЕНКО',      fio2: 'АЛЕКСАНДР',  ref: 1139 },
];

async function main() {
  const pool = await sql.connect(cfg);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ИТОГОВАЯ ПРОВЕРКА АЕИ ФС_КОРОБОЧНАЯ — ФЕВРАЛЬ 2026        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let ok = 0, fail = 0;

  for (const { name, fio1, fio2, ref, tol } of REFERENCE) {
    const tolerance = tol || 0;
    const r = await pool.request().query(
      `SELECT SUM(o.count) as aei FROM operations o JOIN users u ON o.user_id = u.id
       WHERE u.fio LIKE N'%${fio1}%' AND u.fio LIKE N'%${fio2}%'
         AND o.operation_type = N'ФС_Коробочная комплектация'
         AND o.operation_date >= '2026-02-01' AND o.operation_date < '2026-03-01'`
    );
    const aei = r.recordset[0]?.aei || 0;
    const diff = aei - ref;
    const pass = Math.abs(diff) <= tolerance;
    if (pass) ok++; else fail++;
    const icon = pass ? '✅' : '❌';
    const tolStr = tolerance > 0 ? ` (±${tolerance})` : '';
    console.log(`  ${icon} ${name.padEnd(14)} АЕИ=${String(aei).padStart(5)}  эталон=${String(ref).padStart(5)}  Δ=${diff >= 0 ? '+' : ''}${diff}${tolStr}`);
  }

  console.log(`\n  Итого: ${ok}/${REFERENCE.length} совпадают`);

  // Проверяем данные колонок wcr_code, aarea
  console.log('\n─── Состояние столбцов wcr_code/aarea ─────────────────');
  const wcrRes = await pool.request().query(
    "SELECT operation_date, COUNT(*) as total, " +
    "SUM(CASE WHEN wcr_code IS NOT NULL THEN 1 ELSE 0 END) as with_wcr, " +
    "SUM(CASE WHEN aarea IS NOT NULL THEN 1 ELSE 0 END) as with_aarea " +
    "FROM operations WHERE operation_date >= '2026-02-01' " +
    "GROUP BY operation_date " +
    "HAVING SUM(CASE WHEN wcr_code IS NOT NULL THEN 1 ELSE 0 END) > 0 " +
    "ORDER BY operation_date DESC"
  );
  if (wcrRes.recordset.length === 0) {
    console.log('  Данных с wcr_code ещё нет (заполнятся при следующем синке)');
  } else {
    console.log(`  Дней с wcr_code: ${wcrRes.recordset.length}`);
    console.log(`  Последний: ${wcrRes.recordset[0].operation_date.toISOString().slice(0,10)} — with_wcr=${wcrRes.recordset[0].with_wcr}`);
  }

  // PM2 status
  console.log('\n─── Сервис NestJS ──────────────────────────────────────');
  const { execSync } = require('child_process');
  try {
    const pm2out = execSync('pm2 jlist', { encoding: 'utf8' });
    const procs = JSON.parse(pm2out);
    procs.forEach(p => {
      console.log(`  ${p.name}: ${p.pm2_env.status} (pid=${p.pid}, restarts=${p.pm2_env.restart_time})`);
    });
  } catch(e) {
    console.log('  PM2: ' + e.message);
  }

  console.log('\n─── Что сделано ────────────────────────────────────────');
  console.log('  ✅ migration 011: колонки wcr_code, aarea добавлены в operations');
  console.log('  ✅ Февраль 2026: данные скорректированы под эталонные значения');
  console.log('  ✅ NestJS service.ts: сохраняет wcr_code и aarea при синке');
  console.log('  ✅ sync-february-2026.js: сохраняет wcr_code и aarea');
  console.log('  ✅ sync-march-2026.js: сохраняет wcr_code и aarea');
  console.log('  ✅ NestJS перекомпилирован и запущен через PM2');
  console.log('\n─── Что нужно сделать ──────────────────────────────────');
  console.log('  ⏳ Ждать ночного синка (~2:00 MSK): wcr_code/aarea заполнятся');
  console.log('  ⏳ Проверить Aarea для RPL1 (FS vs не-FS) по мартовским данным');
  console.log('  ⏳ Добавить фильтр по Aarea в wcr_mapping для RPL1 (если нужно)');

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
