// npx ts-node --transpile-only test/warehouse-rates.service.test.ts
import test from 'node:test';
import assert from 'node:assert';
import * as sql from 'mssql';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WarehouseRatesService } from '../src/norms/warehouse-rates.service';

type Call = { text: string; params: Record<string, any> };

/** Подмена mssql на уровне прототипов: ничего не уходит в БД. */
function stubMssql(responder: (text: string) => any[] | undefined, failOn?: RegExp) {
  const calls: Call[] = [];
  const state = { begun: 0, committed: 0, rolledBack: 0 };
  const orig = {
    begin: sql.Transaction.prototype.begin,
    commit: sql.Transaction.prototype.commit,
    rollback: sql.Transaction.prototype.rollback,
    input: sql.Request.prototype.input,
    query: sql.Request.prototype.query,
  };
  (sql.Transaction.prototype as any).begin = async function () { state.begun++; };
  (sql.Transaction.prototype as any).commit = async function () { state.committed++; };
  (sql.Transaction.prototype as any).rollback = async function () { state.rolledBack++; };
  (sql.Request.prototype as any).input = function (name: string, ...rest: any[]) {
    (this.__p ??= {})[name] = rest[rest.length - 1];
    return this;
  };
  (sql.Request.prototype as any).query = async function (text: string) {
    calls.push({ text, params: { ...(this.__p ?? {}) } });
    if (failOn && failOn.test(text)) throw new Error('boom');
    const rows = responder(text) ?? [];
    return { recordset: rows, rowsAffected: [text.includes('UPDATE o SET') ? 7 : 1] };
  };
  const restore = () => {
    Object.assign(sql.Transaction.prototype, { begin: orig.begin, commit: orig.commit, rollback: orig.rollback });
    Object.assign(sql.Request.prototype, { input: orig.input, query: orig.query });
  };
  return { calls, state, restore };
}

function makeService(dbRows: Record<string, any> = {}) {
  const queries: Call[] = [];
  const db: any = {
    getPool: () => ({}),
    queryOne: async (text: string, params: any) => {
      queries.push({ text, params });
      if (text.includes('FROM warehouses')) return 'wh' in dbRows ? dbRows.wh : { code: '0SK2', name: 'СК Омск' };
      if (text.includes('COUNT(*)')) return { n: 'known' in dbRows ? dbRows.known : 1 };
      return null;
    },
    query: async (text: string, params: any) => { queries.push({ text, params }); return dbRows.list ?? []; },
  };
  const logger: any = { log: () => {}, error: () => {}, warn: () => {} };
  return { svc: new WarehouseRatesService(db, logger), queries };
}

const actor = { id: 5, employeeId: '00012345' };
const monthDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('list: склад берётся из профиля, код склада уходит в запрос', async () => {
  const { svc, queries } = makeService({ list: [{ wcr_code: 'PM11' }] });
  const r = await svc.list(42);
  assert.deepStrictEqual(r.warehouse, { code: '0SK2', name: 'СК Омск' });
  assert.strictEqual(queries[0].params.id, 42);
  assert.strictEqual(queries[1].params.wh, '0SK2');
  assert.strictEqual(r.rates.length, 1);
});

test('list: склад не найден → NotFound', async () => {
  const { svc } = makeService({ wh: null });
  await assert.rejects(() => svc.list(1), NotFoundException);
});

test('setRate: невалидная ставка отклоняется до любых обращений к БД', async () => {
  const { svc, queries } = makeService();
  await assert.rejects(() => svc.setRate(1, 'PM11', 'abc', undefined, actor), BadRequestException);
  assert.strictEqual(queries.length, 0);
});

test('setRate: неизвестный WCR → NotFound, транзакция не открывается', async () => {
  const s = stubMssql(() => []);
  try {
    const { svc } = makeService({ known: 0 });
    await assert.rejects(() => svc.setRate(1, 'ZZZZ', 1, undefined, actor), NotFoundException);
    assert.strictEqual(s.state.begun, 0);
  } finally { s.restore(); }
});

test('setRate: порядок шагов, параметры, commit, результат', async () => {
  const s = stubMssql((t) => {
    if (t.includes('SELECT TOP 1 area')) return [{ area: 'Коробочная комплектация' }];
    if (t.includes('norm_aei_per_hour FROM')) return [{ norm_aei_per_hour: 75 }];
    return [];
  });
  try {
    const { svc } = makeService();
    const res = await svc.setRate(1, ' pm11 ', '2,25', monthDay(), actor);

    const kinds = s.calls.map((c) =>
      /^\s*DELETE/.test(c.text) ? 'delete'
        : /INSERT INTO wcr_warehouse_rates/.test(c.text) ? 'insert'
        : /UPDATE wcr_warehouse_rates/.test(c.text) ? 'close'
        : /UPDATE o SET/.test(c.text) ? 'recalc' : 'select');
    assert.deepStrictEqual(kinds, ['select', 'select', 'delete', 'close', 'insert', 'recalc']);

    const ins = s.calls.find((c) => c.text.includes('INSERT INTO'))!;
    assert.strictEqual(ins.params.wh, '0SK2');       // склад из профиля
    assert.strictEqual(ins.params.wcr, 'PM11');      // trim + upper
    assert.strictEqual(ins.params.rate, 2.25);
    assert.strictEqual(ins.params.area, 'Коробочная комплектация');
    assert.strictEqual(ins.params.norm, 75);         // норматив переносится из прежней версии

    const recalc = s.calls.find((c) => c.text.includes('UPDATE o SET'))!;
    assert.strictEqual(recalc.params.newRate, 2.25);
    assert.match(recalc.text, /salary_summary/);     // закрытые периоды исключены
    assert.match(recalc.text, /o\.warehouse_code = @wh/); // только свой склад

    assert.strictEqual(s.state.committed, 1);
    assert.strictEqual(s.state.rolledBack, 0);
    assert.deepStrictEqual(res, {
      warehouse_code: '0SK2', wcr_code: 'PM11', rate: 2.25,
      effective_from: monthDay(), recalculated_operations: 7,
    });
  } finally { s.restore(); }
});

test('setRate(null): сброс к общей — без INSERT, пересчёт по общей ставке', async () => {
  const s = stubMssql(() => []);
  try {
    const { svc } = makeService();
    const res = await svc.setRate(1, 'PM11', null, undefined, actor);
    assert.ok(!s.calls.some((c) => c.text.includes('INSERT INTO')));
    assert.ok(s.calls.some((c) => /^\s*DELETE/.test(c.text)));
    const recalc = s.calls.find((c) => c.text.includes('UPDATE o SET'))!;
    assert.strictEqual(recalc.params.newRate, null);
    assert.strictEqual(res.rate, null);
    assert.strictEqual(s.state.committed, 1);
  } finally { s.restore(); }
});

test('setRate: ошибка в середине → rollback, commit не вызывается', async () => {
  const s = stubMssql(() => [], /INSERT INTO/);
  try {
    const { svc } = makeService();
    await assert.rejects(() => svc.setRate(1, 'PM11', 3, undefined, actor), /boom/);
    assert.strictEqual(s.state.rolledBack, 1);
    assert.strictEqual(s.state.committed, 0);
  } finally { s.restore(); }
});
