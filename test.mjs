// Быстрая проверка логики: node test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answer, buildView, checkInn, checkSnils, checklist, courtByAddress, diagnose, freshness, missing, render, stepErrors } from './logic.js';

globalThis.fetch = async (u) => ({ json: async () => JSON.parse(readFileSync(new URL(u, import.meta.url))) });
const { loadRules } = await import('./logic.js');
const R = await loadRules('./data/');

const base = { debtTotal: 700000, debtTypes: ['bank'], canPay: 'no', enforcement: 'none', social: 'none', income: 'low', family: 'single', children: 'no', property: ['nothing'], deals: ['none'], business: 'no', otherCases: 'no', prevBankruptcy: 'no' };
assert.equal(diagnose(base, R).path, 'court');
assert.equal(diagnose(base, R).mandatory, true);
assert.equal(diagnose({ ...base, debtTotal: 300000, enforcement: 'closed_no_property' }, R).path, 'outOfCourt');
assert.equal(diagnose({ ...base, property: ['mortgage'] }, R).level, 'red');
assert.ok(checklist(R, 'court', base).some((d) => d.id === 'deposit_receipt'));
assert.ok(!checklist(R, 'outOfCourt', base).some((d) => d.id === 'deposit_receipt'));
assert.equal(courtByAddress('г. Томск', R).id, 'tomsk');
assert.equal(courtByAddress('г. Омск', R).id, 'omsk');
assert.equal(checkInn('500100732259'), null);
assert.ok(checkInn('500100732258'));
assert.equal(checkSnils('112-233-445 95'), null);
assert.equal(answer('как спрятать квартиру от управляющего', R).kind, 'refusal');
assert.equal(answer('можно ли выезжать за границу', R).kind, 'answer');

const p = { lastName: 'Иванов', firstName: 'Иван', birthDate: '01.01.1980', birthPlace: 'г. Омск', passportSeries: '5200', passportNumber: '123456', passportIssuedBy: 'УМВД', passportIssuedAt: '01.01.2020', inn: '500100732259', snils: '112-233-445 95', regAddress: 'г. Омск', courtId: 'omsk', sro: 'СРО', circumstances: 'Потеря работы', creditors: [{ type: 'bank', name: 'Банк', basis: 'Договор', principal: '100000' }] };
for (const id of ['court_application', 'creditors_list', 'property_inventory', 'deposit_motion', 'attach_motion', 'manager_letter', 'mfc_data']) {
  const t = R.templates.find((x) => x.id === id);
  assert.deepEqual(missing(t, buildView(p, R)), [], id);
  assert.ok(render(t, buildView(p, R)).length > 3);
}
assert.deepEqual(stepErrors('me', p), []);
assert.deepEqual(stepErrors('creditors', p), []);
assert.ok(stepErrors('me', {}).length > 5);
assert.ok(stepErrors('court', { ...p, circumstances: 'текст [укажите]' }).some((e) => e.includes('скобках')));
assert.equal(answer('рецепт борща', R).text, R.refusals.outOfScope);
const egrip = R.documents.find((d) => d.id === 'egrip');
assert.equal(freshness(egrip, { status: 'received', at: '2026-09-01' }, R, new Date('2026-09-20')), 'expired');
const v = buildView({ ...p, property: [{ kind: 'car', description: 'Lada', value: '200000', pledge: 'no' }] }, R, 'court', { passport: { status: 'received' } }, {});
assert.ok(v.attachments.some((a) => a.title.startsWith('Паспорт')));
assert.equal(v.property[0].kindText, 'Транспортное средство');
console.log('OK: логика мини-приложения работает');
