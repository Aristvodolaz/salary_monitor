// node --test test/warehouse-rates.test.js
const test = require('node:test');
const assert = require('node:assert');
const { parseRates } = require('../scripts/lib/warehouse-rates');

const hdr = [['Склад', 'Правило', 'Участок', 'Норматив/час', 'Расценка, руб.']];
const parse = (rows) => parseRates([...hdr, ...rows].slice(1));

test('склады маппятся на коды, одинаковый WCR на разных складах не конфликтует', () => {
  const r = parse([
    ['Омск', 'PM11', 'Коробочная комплектация', 75, 2.25],
    ['Пермь', 'PM11', 'Коробочная комплектация', 90, 1.96],
  ]);
  assert.deepStrictEqual(r.rates.map((x) => [x.warehouse, x.wcr, x.rate]), [['0SK2', 'PM11', 2.25], ['0SK1', 'PM11', 1.96]]);
  assert.strictEqual(r.conflicts.length, 0);
});

test('полный дубликат схлопывается и фиксируется', () => {
  const r = parse([
    ['Омск', 'IN03', 'Пополнение товара', 55, 3.07],
    ['Омск', 'IN03', 'Пополнение товара', 55, 3.07],
  ]);
  assert.strictEqual(r.rates.length, 1);
  assert.strictEqual(r.duplicates.length, 1);
});

test('один WCR на разных участках с разными значениями — конфликт, не загружается', () => {
  const r = parse([
    ['Омск', 'IN01', 'Пополнение товара', 55, 3.07],
    ['Омск', 'IN01', 'Сортировка товара', 132, 1.28],
  ]);
  assert.strictEqual(r.rates.length, 0);
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.conflicts[0].variants.length, 2);
});

test('неизвестный склад и плохая расценка — ошибки, не молчаливая подстановка', () => {
  const r = parse([
    ['Москва', 'PM11', 'X', 1, 1],
    ['Омск', 'PM11', 'X', 1, 'abc'],
  ]);
  assert.strictEqual(r.rates.length, 0);
  assert.strictEqual(r.errors.length, 2);
});

test('расценка хранится с точностью до копеек', () => {
  const r = parse([['Шушары', 'PMWT', 'Коробочный отбор', 100, 4.05]]);
  assert.strictEqual(r.rates[0].rate, 4.05);
});

test('повторный разбор даёт тот же результат (идемпотентность)', () => {
  const rows = [['Омск', 'PCST', 'Коробочная комплектация', 75, 2.25]];
  assert.deepStrictEqual(parse(rows), parse(rows));
});
