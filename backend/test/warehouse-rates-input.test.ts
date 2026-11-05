// npx ts-node test/warehouse-rates-input.test.ts  (node:test)
import test from 'node:test';
import assert from 'node:assert';
import { validateRateInput } from '../src/norms/warehouse-rates.service';

const today = new Date(2026, 10, 15, 10, 0, 0); // 15 ноября 2026

test('ставка с запятой и точностью до копеек принимается', () => {
  assert.deepStrictEqual(validateRateInput('2,25', '2026-11-10', today), { rate: 2.25, effectiveFrom: '2026-11-10' });
});

test('null — сброс к общей ставке, дата по умолчанию — сегодня', () => {
  assert.deepStrictEqual(validateRateInput(null, undefined, today), { rate: null, effectiveFrom: '2026-11-15' });
});

test('плохие ставки отклоняются', () => {
  for (const bad of ['abc', -1, 1.234, 1e9, NaN]) {
    assert.throws(() => validateRateInput(bad, '2026-11-15', today), /Ставк/);
  }
});

test('дата: будущее и прошлые месяцы запрещены, мусор тоже', () => {
  assert.throws(() => validateRateInput(1, '2026-11-16', today), /будущем/);
  assert.throws(() => validateRateInput(1, '2026-10-31', today), /текущего месяца/);
  assert.throws(() => validateRateInput(1, '15.11.2026', today), /YYYY-MM-DD/);
  assert.throws(() => validateRateInput(1, '2026-13-40', today), /YYYY-MM-DD/);
});

test('граница: 1-е число текущего месяца допустимо', () => {
  assert.strictEqual(validateRateInput(0, '2026-11-01', today).effectiveFrom, '2026-11-01');
});
