// Разбор таблицы «Тарифы.xlsx» → расценки по складам (wcr_warehouse_rates).
// Чистые функции без доступа к БД — покрыты тестом test/warehouse-rates.test.js.
const XLSX = require('xlsx');

// Названия складов из таблицы → коды складов
const WAREHOUSE_BY_NAME = {
  'Омск': '0SK2',
  'Пермь': '0SK1',
  'Новосиб': '0SK5',
  'Шушары': '0SK6',
};

/** Читает xlsx: колонки Склад | Правило/Очередь | Участок | Норматив/час | Расценка, руб. */
function readRows(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }).slice(1);
}

/**
 * Нормализует строки, схлопывает полные дубликаты, выделяет конфликты.
 * Ключ тарифа — (склад, WCR): в БД на него один тариф. Один WCR на разных участках
 * одного склада с разными значениями — конфликт, ни один вариант не загружается.
 * Возвращает { rates, duplicates, conflicts, errors }.
 */
function parseRates(rows) {
  const errors = [];
  const byKey = new Map();
  const duplicates = [];

  rows.forEach((r, i) => {
    const line = i + 2; // номер строки в Excel
    if (!r || r.every((c) => c === undefined || c === null || c === '')) return;
    const [whName, wcrRaw, areaRaw, normRaw, rateRaw] = r;
    const warehouse = WAREHOUSE_BY_NAME[String(whName ?? '').trim()];
    const wcr = String(wcrRaw ?? '').trim();
    const area = String(areaRaw ?? '').trim();
    const norm = Number(normRaw);
    const rate = Number(rateRaw);

    if (!warehouse) return errors.push({ line, reason: `неизвестный склад «${whName}»` });
    if (!wcr) return errors.push({ line, reason: 'пустое правило/очередь' });
    if (!area) return errors.push({ line, reason: 'пустой участок' });
    if (!Number.isFinite(rate) || rate < 0) return errors.push({ line, reason: `некорректная расценка «${rateRaw}»` });
    if (normRaw !== undefined && normRaw !== null && normRaw !== '' && !Number.isFinite(norm)) {
      return errors.push({ line, reason: `некорректный норматив «${normRaw}»` });
    }

    const entry = {
      warehouse,
      wcr,
      area,
      norm: Number.isFinite(norm) ? norm : null,
      rate: Math.round(rate * 100) / 100, // DECIMAL(9,2)
      lines: [line],
    };
    const key = `${warehouse}|${wcr}`;
    const list = byKey.get(key) ?? [];
    const same = list.find((e) => e.area === area && e.norm === entry.norm && e.rate === entry.rate);
    if (same) {
      same.lines.push(line);
      if (!duplicates.includes(same)) duplicates.push(same);
    } else {
      list.push(entry);
    }
    byKey.set(key, list);
  });

  const rates = [];
  const conflicts = [];
  for (const list of byKey.values()) {
    if (list.length === 1) rates.push(list[0]);
    else conflicts.push({ warehouse: list[0].warehouse, wcr: list[0].wcr, variants: list });
  }
  return { rates, duplicates, conflicts, errors };
}

module.exports = { WAREHOUSE_BY_NAME, readRows, parseRates };
