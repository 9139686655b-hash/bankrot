// Быстрая проверка логики: node test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answer, buildView, checkInn, checkSnils, checklist, courtByAddress, diagnose, freshness, missing, render, stepErrors } from './logic.js';

globalThis.fetch = async (u) => ({ json: async () => JSON.parse(readFileSync(new URL(u.split('?')[0], import.meta.url))) });
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
// Склонение ФИО, сумма прописью, уполномоченный орган
const pm = { ...p, lastName: 'Иванова', firstName: 'Мария', middleName: 'Петровна' };
const appText = render(R.templates.find((t) => t.id === 'court_application'), buildView(pm, R)).map((b) => b.text ?? '').join('\n');
assert.ok(appText.includes('Признать Иванову Марию Петровну несостоятельной (банкротом)'), 'винительный падеж и род');
assert.ok(render(R.templates.find((t) => t.id === 'court_application'), buildView(p, R)).some((b) => (b.text ?? '').includes('Признать Тестова Теста Тестовича несостоятельным') || (b.text ?? '').includes('несостоятельным (банкротом) и ввести')), 'мужской род');
assert.ok(appText.includes('заявление Ивановой Марии Петровны'), 'родительный падеж');
assert.ok(appText.includes('(сто тысяч рублей 00 копеек)'), 'сумма прописью');
assert.ok(appText.includes('Уполномоченный орган: УФНС России по Омской области'));
// Официальные формы: разделы и налоги отдельно
const pf = { ...p, creditors: [...p.creditors, { type: 'tax', name: 'Транспортный налог', principal: '5000', penalties: '300' }],
  property: [{ kind: 'car', description: 'Lada Granta, 2012', vin: 'XTA000', value: '200000', pledge: 'no' }, { kind: 'realty', description: 'Квартира', area: '45', ownership: 'joint', pledge: 'yes', pledgee: 'ПАО Банк' }],
  accounts: [{ bank: 'ПАО Сбербанк', balance: '50' }], cash: '19000', receivables: [{ name: 'Петров П.П.', amount: '10000' }] };
const vf = buildView(pf, R);
assert.equal(vf.creditorsMoney.length, 1); assert.equal(vf.creditorsTax.length, 1); assert.equal(vf.creditorsTax[0].n, '2.1');
assert.equal(vf.vehicles[0].n, '2.1'); assert.equal(vf.realty[0].ownText, 'общая совместная'); assert.equal(vf.realty[0].pledgeText, 'да, ПАО Банк');
assert.equal(vf.accounts[0].n, '3.1'); assert.equal(vf.valuables[0].description, 'Наличные денежные средства');
const cl = render(R.templates.find((t) => t.id === 'creditors_list'), vf);
assert.ok(cl.some((b) => b.t === 'table' && b.header.includes('Недоимка')), 'раздел обязательных платежей');
assert.ok(cl.some((b) => b.text === 'IV. Сведения о должниках гражданина'));
const inv = render(R.templates.find((t) => t.id === 'property_inventory'), vf);
assert.ok(inv.some((b) => b.t === 'table' && b.header[2] === 'Идентификационный номер'));
assert.ok(inv.filter((b) => b.text === 'Отсутствуют.').length >= 2, 'пустые разделы помечены');
console.log('OK: логика мини-приложения работает');
