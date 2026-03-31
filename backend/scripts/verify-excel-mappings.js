#!/usr/bin/env node

/**
 * Verify Excel Operation Code Mappings Against Database
 *
 * This script:
 * 1. Reads the Excel file with rules (Участок, Правило, Описание)
 * 2. Loads the wcr_mapping table from the database
 * 3. Compares them and identifies mismatches
 * 4. Generates a report of what needs to be fixed
 * 5. Creates an update script if differences are found
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DB_CONFIG = {
  user: 'sa',
  password: 'icY2eGuyfU',
  server: 'PRM-SRV-MSSQL-01.komus.net',
  port: 59587,
  database: 'SalaryMonitor',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

const EXCEL_FILE = 'C:\\Users\\G15\\Desktop\\Книга1.xlsx';
const REPORT_FILE = './scripts/mapping-audit-report.json';

async function readExcelRules() {
  console.log('📖 Чтение Excel файла...\n');

  if (!fs.existsSync(EXCEL_FILE)) {
    throw new Error(`❌ Файл не найден: ${EXCEL_FILE}`);
  }

  const workbook = XLSX.readFile(EXCEL_FILE);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!worksheet) {
    throw new Error('❌ Excel файл пуст или имеет неправильный формат');
  }

  // Преобразуем в массив массивов
  const excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  const rules = [];

  // Пропускаем заголовок (первая строка)
  for (let i = 1; i < excelData.length; i++) {
    const row = excelData[i];
    if (!row || !row[1]) continue; // Пропускаем пустые строки

    const participantArea = String(row[0] || '').trim();  // Участок (ФС, М2, etc)
    const code = String(row[1] || '').trim();              // Правило (PCST, PST2, etc)
    const shortDesc = String(row[2] || '').trim();         // Описание (Коробочная комплектация)
    const fullDesc = String(row[3] || '').trim();          // Полное описание (ФС_Коробочная комплектация)

    if (code && code !== 'Правило') {
      rules.push({
        participant_area: participantArea,
        code,
        short_description: shortDesc,
        full_description: fullDesc
      });
    }
  }

  console.log(`✅ Загружено ${rules.length} правил из Excel\n`);
  console.log('Примеры загруженных правил:');
  rules.slice(0, 5).forEach(r => {
    console.log(`  ${r.code.padEnd(10)} (${r.participant_area}) → ${r.full_description}`);
  });
  console.log('  ...\n');

  return rules;
}

async function getDatabaseMappings() {
  console.log('🔄 Подключение к БД и загрузка маппингов...\n');

  const pool = new sql.ConnectionPool(DB_CONFIG);
  await pool.connect();

  const result = await pool.request().query(`
    SELECT
      wcr_code,
      operation_type,
      participant_area,
      description,
      is_active
    FROM wcr_mapping
    WHERE is_active = 1
    ORDER BY wcr_code
  `);

  await pool.close();

  console.log(`✅ Загружено ${result.recordset.length} маппингов из БД\n`);

  // Преобразуем в объект для удобства сравнения
  const mappings = {};
  result.recordset.forEach(row => {
    mappings[row.wcr_code] = {
      operation_type: row.operation_type,
      participant_area: row.participant_area,
      description: row.description
    };
  });

  return { mappings, recordset: result.recordset };
}

function compareRules(excelRules, dbMappings) {
  console.log('🔍 Сравнение Excel правил с БД маппингами...\n');

  const report = {
    timestamp: new Date().toISOString(),
    excelCount: excelRules.length,
    dbCount: Object.keys(dbMappings).length,
    missing_in_db: [],        // Есть в Excel, но нет в БД
    extra_in_db: [],          // Есть в БД, но нет в Excel
    mismatch_in_db: [],       // Есть в обоих, но маппинг не совпадает
    summary: {}
  };

  // Создаём быстрый поиск по кодам из Excel
  const excelByCode = {};
  excelRules.forEach(rule => {
    excelByCode[rule.code] = rule;
  });

  // Поиск кодов, которых нет в БД или маппинг неправильный
  for (const rule of excelRules) {
    if (!dbMappings.hasOwnProperty(rule.code)) {
      report.missing_in_db.push({
        code: rule.code,
        participant_area: rule.participant_area,
        expected_operation_type: rule.full_description,
        excel_description: rule.short_description,
        db_mapping: null
      });
    } else {
      const dbMapping = dbMappings[rule.code];
      // Проверяем что participant_area совпадает
      if (dbMapping.participant_area !== rule.participant_area) {
        report.mismatch_in_db.push({
          code: rule.code,
          expected: {
            participant_area: rule.participant_area,
            operation_type: rule.full_description
          },
          actual: {
            participant_area: dbMapping.participant_area,
            operation_type: dbMapping.operation_type
          }
        });
      }
    }
  }

  // Поиск кодов, которые в БД, но не в Excel (лишние)
  for (const code of Object.keys(dbMappings)) {
    if (!excelByCode.hasOwnProperty(code)) {
      report.extra_in_db.push({
        code,
        db_mapping: dbMappings[code]
      });
    }
  }

  // Подсчет результатов
  report.summary = {
    total_excel_rules: report.excelCount,
    total_db_mappings: report.dbCount,
    missing_in_db: report.missing_in_db.length,
    mismatch_in_db: report.mismatch_in_db.length,
    extra_in_db: report.extra_in_db.length,
    all_correct:
      report.missing_in_db.length === 0 &&
      report.mismatch_in_db.length === 0 &&
      report.extra_in_db.length === 0
  };

  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ОТЧЕТ О СООТВЕТСТВИИ МАППИНГОВ');
  console.log('='.repeat(80) + '\n');

  console.log('📈 СТАТИСТИКА:');
  console.log(`   Правил в Excel: ${report.summary.total_excel_rules}`);
  console.log(`   Маппингов в БД: ${report.summary.total_db_mappings}`);
  console.log(`   Отсутствуют в БД: ${report.summary.missing_in_db}`);
  console.log(`   Неправильный маппинг: ${report.summary.mismatch_in_db}`);
  console.log(`   Лишние в БД: ${report.summary.extra_in_db}\n`);

  if (report.summary.all_correct) {
    console.log('✅ РЕЗУЛЬТАТ: ВСЕ МАППИНГИ КОРРЕКТНЫ!\n');
    return;
  }

  if (report.missing_in_db.length > 0) {
    console.log(`❌ ОТСУТСТВУЮТ В БД (${report.missing_in_db.length}):\n`);
    report.missing_in_db.forEach(item => {
      console.log(`   ${item.code.padEnd(10)} (${item.participant_area}) → ${item.expected_operation_type}`);
    });
    console.log('');
  }

  if (report.mismatch_in_db.length > 0) {
    console.log(`⚠️  НЕПРАВИЛЬНЫЙ МАППИНГ (${report.mismatch_in_db.length}):\n`);
    report.mismatch_in_db.forEach(item => {
      console.log(`   ${item.code.padEnd(10)}`);
      console.log(`      Ожидается: ${item.expected.participant_area} → ${item.expected.operation_type}`);
      console.log(`      В БД:      ${item.actual.participant_area} → ${item.actual.operation_type}`);
    });
    console.log('');
  }

  if (report.extra_in_db.length > 0) {
    console.log(`⚠️  ЛИШНИЕ В БД (${report.extra_in_db.length}) - НЕ УКАЗАНЫ В EXCEL:\n`);
    // Группируем по warehouse
    const byArea = {};
    report.extra_in_db.forEach(item => {
      const area = item.db_mapping.participant_area;
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(item);
    });

    Object.entries(byArea).forEach(([area, items]) => {
      console.log(`   ${area}:`);
      items.forEach(item => {
        console.log(`      ${item.code.padEnd(10)} → ${item.db_mapping.operation_type}`);
      });
    });
    console.log('');
  }
}

function generateUpdateScript(excelRules, report) {
  // Для теперь просто уведомляем что нужно проверить
  // Полное обновление требует понимания как маппировать новые коды

  if (report.summary.all_correct) {
    return null;
  }

  let script = `-- =============================================
-- SQL Script: Fix Operation Code Mappings
-- Generated: ${new Date().toISOString()}
-- =============================================

USE SalaryMonitor;
GO

`;

  if (report.missing_in_db.length > 0) {
    script += `-- ДОБАВИТЬ НОВЫЕ КОДЫ (${report.missing_in_db.length} шт)
-- ТРЕБУЕТ РУЧНОГО ПОДТВЕРЖДЕНИЯ!
`;
    report.missing_in_db.forEach(item => {
      script += `-- INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, description, is_active)
-- VALUES ('${item.code}', '${item.expected_operation_type}', '${item.participant_area}', 'Auto-added from Excel', 1);
`;
    });
    script += '\n';
  }

  if (report.mismatch_in_db.length > 0) {
    script += `-- ИСПРАВИТЬ НЕПРАВИЛЬНЫЕ МАППИНГИ (${report.mismatch_in_db.length} шт)
`;
    report.mismatch_in_db.forEach(item => {
      script += `-- UPDATE wcr_mapping
-- SET operation_type = '${item.expected.operation_type}',
--     participant_area = '${item.expected.participant_area}'
-- WHERE wcr_code = '${item.code}';
`;
    });
    script += '\n';
  }

  return script;
}

async function main() {
  try {
    console.log('\n🚀 ПРОВЕРКА МАППИНГОВ ОПЕРАЦИЙ\n');

    // 1. Читаем Excel
    const excelRules = await readExcelRules();

    // 2. Загружаем маппинги из БД
    const { mappings: dbMappings } = await getDatabaseMappings();

    // 3. Сравниваем
    const report = compareRules(excelRules, dbMappings);

    // 4. Выводим отчет
    printReport(report);

    // 5. Сохраняем отчет
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`📝 Отчет сохранен: ${REPORT_FILE}\n`);

    // Выводим команду для следующего шага
    if (!report.summary.all_correct) {
      console.log('\n' + '='.repeat(80));
      console.log('📋 СТАТУС: НАЙДЕНЫ НЕСООТВЕТСТВИЯ');
      console.log('='.repeat(80));
      console.log('\n1. Проверьте отчет:');
      console.log(`   cat ${REPORT_FILE}`);
      console.log('\n2. Если нужно исправить маппинги, свяжитесь с администратором БД');
      console.log('\n3. После исправления повторно запустите эту проверку\n');
    } else {
      console.log('\n' + '='.repeat(80));
      console.log('✅ ПРОВЕРКА ЗАВЕРШЕНА: ВСЕ МАППИНГИ КОРРЕКТНЫ');
      console.log('='.repeat(80) + '\n');
    }

    process.exit(report.summary.all_correct ? 0 : 1);

  } catch (err) {
    console.error('\n❌ ОШИБКА:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
