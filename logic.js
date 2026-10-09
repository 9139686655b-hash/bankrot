// Логика мини-приложения: диагностика, чек-лист, подсудность, проверка полей, документы, ответы на вопросы.
// Все суммы, сроки и тексты — в data/*.json, здесь только правила их применения.
import Mustache from './vendor/mustache.mjs';
import petrovich from './vendor/petrovich.mjs';

Mustache.escape = (t) => t; // экранирование делаем сами при выводе в HTML

// Версия из index.html: код и данные загружаются согласованно, без смешения старого кэша с новым.
export async function loadRules(base = './data/') {
  const names = ['rules', 'diagnosis', 'documents', 'timeline', 'knowledge', 'courts', 'templates', 'legal'];
  const [rules, diagnosis, documents, timeline, knowledge, courts, templates, legal] = await Promise.all(
    names.map((n) => fetch(`${base}${n}.json?v=${globalThis.APP_VERSION ?? ''}`).then((r) => r.json())),
  );
  return {
    version: rules.version,
    checkedAt: rules.checkedAt,
    params: rules.params,
    nonDischargeable: rules.nonDischargeable,
    questions: diagnosis.questions,
    terms: diagnosis.terms,
    documents: documents.items,
    timeline,
    knowledge: knowledge.entries,
    refusals: knowledge.refusals,
    courts: courts.courts,
    templates: templates.templates,
    legal,
  };
}

export const param = (R, key) => R.params[key]?.value ?? null;
export const rub = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : new Intl.NumberFormat('ru-RU').format(n));
export const dateRu = (iso) => iso.slice(0, 10).split('-').reverse().join('.');
export function years(n) {
  if (n === null) return '— лет';
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? 'год' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'года' : 'лет'}`;
}

// ---------------- Диагностика ----------------

const has = (a, q, v) => (Array.isArray(a[q]) ? a[q].includes(v) : a[q] === v);

export function isAnswered(q, a) {
  const v = a[q.id];
  if (q.type === 'number') return typeof v === 'number' && v >= 0;
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0;
  return typeof v === 'string' && v.length > 0;
}

function outOfCourt(a, R) {
  const debt = Number(a.debtTotal) || 0;
  const min = param(R, 'outOfCourt.minDebt');
  const max = param(R, 'outOfCourt.maxDebt');
  if (has(a, 'prevBankruptcy', 'out_of_court') || has(a, 'prevBankruptcy', 'court_recent'))
    return { ok: false, why: 'Вы уже проходили банкротство — повторная процедура через МФЦ ограничена законом.' };
  if (debt < min || debt > max)
    return { ok: false, why: `Через МФЦ можно, если долг от ${rub(min)} до ${rub(max)} ₽. У вас — ${rub(debt)} ₽.` };
  if (has(a, 'enforcement', 'closed_no_property'))
    return { ok: true, why: 'Исполнительное производство окончено, потому что взыскать было нечего, и новых нет.' };
  const social = has(a, 'social', 'pensioner') || has(a, 'social', 'child_benefit');
  if (social && (has(a, 'enforcement', 'open_gt1y') || has(a, 'enforcement', 'open_gt7y')))
    return { ok: true, why: 'Вы получаете пенсию или пособие на ребёнка, а производство у приставов идёт больше года.' };
  if (has(a, 'enforcement', 'open_gt7y'))
    return { ok: true, why: `Производство идёт больше ${param(R, 'outOfCourt.enforcementOpenYearsGeneral')} лет. Условие: не погашено не меньше половины долга — проверьте.` };
  if (has(a, 'enforcement', 'unknown'))
    return { ok: false, why: 'Проверьте, что у вас с приставами, — от этого зависит, подходит ли МФЦ.' };
  return { ok: false, why: 'Для МФЦ закон требует основание, связанное с приставами. У вас его пока нет.' };
}

export function diagnose(a, R) {
  const debt = Number(a.debtTotal) || 0;
  const oc = outOfCourt(a, R);
  const insolvent = has(a, 'canPay', 'no') || has(a, 'canPay', 'partly');
  const flags = [];
  const add = (level, title, text, source) => flags.push({ level, title, text, source });
  if (has(a, 'property', 'mortgage')) add('red', 'Ипотека', 'Жильё в ипотеке — залог банка. Его, скорее всего, продадут, даже если оно единственное. Лучше обсудить с юристом.', 'ст. 213.27 127-ФЗ');
  if (['second_home', 'land', 'business_share'].some((v) => has(a, 'property', v))) add('red', 'Имущество, которое продадут', 'Недвижимость, кроме единственного жилья, участки и доли будут проданы в процедуре.', 'ст. 213.25 127-ФЗ, ст. 446 ГПК РФ');
  if (has(a, 'property', 'car') || has(a, 'property', 'pledge')) add('yellow', 'Автомобиль или залог', 'Автомобиль обычно продают. Залоговое имущество продают, чтобы рассчитаться с залоговым кредитором.', 'ст. 213.25 127-ФЗ');
  if (has(a, 'deals', 'sold_realty') || has(a, 'deals', 'gift_relatives')) add('red', 'Сделки за 3 года', 'Продажу или дарение недвижимости и сделки с родственниками проверят и могут оспорить. Скрывать их нельзя.', 'ст. 61.2, 213.32 127-ФЗ');
  else if (has(a, 'deals', 'sold_car') || has(a, 'deals', 'big_transfers')) add('yellow', 'Сделки за 3 года', 'Сделки проверят. Подготовьте документы: цену, кому ушли деньги и на что потрачены.', 'ст. 61.2 127-ФЗ');
  if (has(a, 'business', 'director')) add('red', 'Руководитель или учредитель компании', 'Есть риск требований о субсидиарной ответственности — такие долги не списываются.', 'п. 5 ст. 213.28 127-ФЗ');
  if (has(a, 'business', 'current_ip') || has(a, 'business', 'former_ip')) add('yellow', 'Статус ИП', 'Банкротство возможно, но документов понадобится больше.', 'ст. 214.1 127-ФЗ');
  if (['alimony', 'damages', 'subsidiary'].some((v) => has(a, 'debtTypes', v))) add('yellow', 'Часть долгов не спишут', 'Алименты, возмещение вреда и субсидиарная ответственность остаются после банкротства.', 'п. 5 ст. 213.28 127-ФЗ');
  if (has(a, 'prevBankruptcy', 'court_recent')) add('red', 'Недавнее банкротство', 'После банкротства через суд несколько лет нельзя снова подать заявление о своём банкротстве.', 'п. 2 ст. 213.30 127-ФЗ');
  if (has(a, 'family', 'married') || has(a, 'family', 'divorced_recent')) add('yellow', 'Имущество супругов', 'Совместно нажитое имущество может попасть в процедуру.', 'ст. 213.26 127-ФЗ');
  if (has(a, 'income', 'regular')) add('yellow', 'Стабильный доход', 'Суд может назначить план погашения долгов частями вместо списания.', 'ст. 213.13 127-ФЗ');
  if (!insolvent && !oc.ok) add('yellow', 'Вы пока платите', 'Если платежи идут вовремя, суд может не признать вас неплатёжеспособным.', 'п. 3 ст. 213.6 127-ФЗ');

  const rank = { green: 0, yellow: 1, red: 2 };
  const level = flags.reduce((m, f) => (rank[f.level] > rank[m] ? f.level : m), 'green');
  const path = oc.ok ? 'outOfCourt' : 'court';
  const mandatory = debt > param(R, 'court.mandatoryFilingThreshold') && insolvent;
  let summary = path === 'outOfCourt'
    ? 'Похоже, вам подходит бесплатное банкротство через МФЦ.'
    : debt < param(R, 'outOfCourt.minDebt')
      ? 'Долг небольшой: суд может обойтись дороже самого долга. Сравните расходы, прежде чем начинать.'
      : 'Вам подходит банкротство через арбитражный суд. Его можно пройти самостоятельно.';
  if (mandatory) summary += ' При вашей сумме долга подать заявление — обязанность по закону.';
  return { path, ocOk: oc.ok, ocWhy: oc.why, mandatory, level, flags, summary, at: new Date().toISOString() };
}

// ---------------- Чек-лист ----------------

export function checklist(R, path, a) {
  return R.documents.filter(({ when }) => {
    if (when.path && !when.path.includes(path)) return false;
    if (when.anyAnswer?.length) {
      return when.anyAnswer.some(({ q, in: vs }) => (Array.isArray(a[q]) ? a[q].some((x) => vs.includes(x)) : vs.includes(String(a[q]))));
    }
    return true;
  });
}

/** Сколько дней справка остаётся свежей (рабочие дни → календарные с запасом). */
export function validityDays(item, R) {
  if (item.validityParam) {
    const wd = param(R, item.validityParam);
    return wd === null ? item.validityDays : Math.floor((wd * 7) / 5);
  }
  return item.validityDays;
}

/** 'fresh' | 'soon' | 'expired' | null */
export function freshness(item, st, R, now = new Date()) {
  const days = validityDays(item, R);
  if (!days || st?.status !== 'received' || !st.at) return null;
  const left = (new Date(st.at).getTime() + days * 86400000 - now.getTime()) / 86400000;
  return left < 0 ? 'expired' : left <= 3 ? 'soon' : 'fresh';
}

export function costText(item, R) {
  if (!item.costParam) return item.cost;
  const v = param(R, item.costParam);
  return v === null ? 'сумма уточняется' : `${rub(v)} ₽`;
}

// ---------------- Подсудность ----------------

export function courtByAddress(address, R) {
  const text = ` ${address.toLowerCase().replace(/ё/g, 'е')}`;
  for (const c of R.courts) {
    for (const stem of c.match) {
      const s = stem.toLowerCase().replace(/ё/g, 'е').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^а-яa-z])${s}`).test(text)) return c;
    }
  }
  return null;
}

// ---------------- Проверка полей ----------------

const digits = (s) => String(s ?? '').replace(/\D/g, '');

export function checkInn(raw) {
  const s = digits(raw);
  if (!s) return 'Укажите ИНН';
  if (s.length !== 12) return 'ИНН — 12 цифр';
  const n = [...s].map(Number);
  const c = (w) => (w.reduce((sum, k, i) => sum + k * n[i], 0) % 11) % 10;
  return c([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === n[10] && c([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === n[11] ? null : 'Похоже, в ИНН опечатка';
}

export function checkSnils(raw) {
  const s = digits(raw);
  if (!s) return 'Укажите СНИЛС';
  if (s.length !== 11) return 'СНИЛС — 11 цифр';
  if (Number(s.slice(0, 9)) <= 1001998) return null;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(s[i]) * (9 - i);
  const exp = sum < 100 ? sum : sum === 100 || sum === 101 ? 0 : sum % 101 === 100 ? 0 : sum % 101;
  return exp === Number(s.slice(9)) ? null : 'Похоже, в СНИЛС опечатка';
}

export function checkDate(raw, required = false) {
  if (!String(raw ?? '').trim()) return required ? 'Укажите дату' : null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!m) return 'Формат: ДД.ММ.ГГГГ';
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) return 'Такой даты нет';
  if (d > new Date()) return 'Дата в будущем';
  return null;
}

export const amount = (s) => {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const checkSeries = (v) => (digits(v).length === 4 ? null : 'Серия — 4 цифры');
export const checkPassNum = (v) => (digits(v).length === 6 ? null : 'Номер — 6 цифр');
export const checkAmount = (v) => (!String(v ?? '').trim() || Number.isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.'))) ? null : 'Введите число');
export function checkCreditorInn(raw) {
  const s = digits(raw);
  if (!s) return null;
  if (s.length === 12) return checkInn(s);
  if (s.length !== 10) return 'ИНН организации — 10 цифр';
  const n = [...s].map(Number);
  const c = ([2, 4, 10, 3, 5, 9, 4, 6, 8].reduce((sum, k, i) => sum + k * n[i], 0) % 11) % 10;
  return c === n[9] ? null : 'Похоже, в ИНН опечатка';
}

/** Ошибки по шагам анкеты. Пустой массив — шаг заполнен. */
export function stepErrors(step, p) {
  const e = [];
  const req = (v, l) => { if (!String(v ?? '').trim()) e.push(l); };
  const chk = (msg, l) => { if (msg) e.push(`${l}: ${msg.toLowerCase()}`); };
  switch (step) {
    case 'me':
      req(p.lastName, 'Фамилия'); req(p.firstName, 'Имя');
      chk(checkDate(p.birthDate, true), 'Дата рождения'); req(p.birthPlace, 'Место рождения');
      chk(checkSeries(p.passportSeries), 'Паспорт'); chk(checkPassNum(p.passportNumber), 'Паспорт');
      req(p.passportIssuedBy, 'Кем выдан паспорт'); chk(checkDate(p.passportIssuedAt, true), 'Дата выдачи');
      chk(checkInn(p.inn), 'ИНН'); chk(checkSnils(p.snils), 'СНИЛС'); req(p.regAddress, 'Адрес регистрации');
      break;
    case 'family':
      req(p.maritalStatus, 'Семейное положение');
      if (!String(p.employment ?? '').trim() && !(p.incomes ?? []).length) e.push('Работа или доходы');
      (p.dependents ?? []).forEach((d, i) => req(d.name, `Иждивенец ${i + 1}: ФИО`));
      (p.incomes ?? []).forEach((r, i) => chk(checkAmount(r.amount), `Доход ${i + 1}`));
      break;
    case 'property':
      (p.property ?? []).forEach((x, i) => { req(x.description, `Имущество ${i + 1}: описание`); chk(checkAmount(x.value), `Имущество ${i + 1}`); });
      (p.accounts ?? []).forEach((x, i) => req(x.bank, `Счёт ${i + 1}: банк`));
      break;
    case 'deals':
      (p.deals ?? []).forEach((x, i) => { req(x.description, `Сделка ${i + 1}`); chk(checkDate(x.date), `Сделка ${i + 1}`); });
      break;
    case 'creditors':
      if (!(p.creditors ?? []).length) e.push('Хотя бы один кредитор');
      (p.creditors ?? []).forEach((c, i) => {
        const n = `Кредитор ${i + 1}`;
        req(c.name, `${n}: название`); req(c.basis, `${n}: основание`);
        if (!amount(c.principal)) e.push(`${n}: основной долг`);
        chk(checkCreditorInn(c.inn), n); chk(checkDate(c.date), n);
      });
      break;
    case 'court':
      req(p.courtId, 'Суд'); req(p.sro, 'СРО'); req(p.circumstances, 'Обстоятельства');
      if (String(p.circumstances ?? '').includes('[')) e.push('Замените текст в квадратных скобках');
      break;
  }
  return e;
}

// ---------------- Документы ----------------

const typeText = { bank: 'Кредитный договор', mfo: 'Договор займа', zhkh: 'Оплата жилищно-коммунальных услуг', tax: 'Обязательный платёж', private: 'Договор займа', other: 'Иное денежное обязательство' };
const kindText = { realty: 'Недвижимость', car: 'Транспортное средство', land: 'Земельный участок', share: 'Доля в организации', securities: 'Ценные бумаги', valuables: 'Ценное имущество', other: 'Иное имущество' };
const ownText = { individual: 'индивидуальная', joint: 'общая совместная', shared: 'общая долевая' };
const maritalText = { single: 'в браке не состою', married: 'состою в браке', divorced: 'брак расторгнут', widowed: 'вдова (вдовец)' };

/** Пол по отчеству (а без него — по фамилии): нужен для «несостоятельным / несостоятельной». */
export function isFemale(p) {
  const mid = String(p.middleName ?? '').trim().toLowerCase();
  if (/(вна|чна|кызы|гызы)$/.test(mid)) return true;
  if (/(ич|оглы|улы|уулу)$/.test(mid)) return false;
  return /(ова|ева|ёва|ина|ына|ая|ская|цкая)$/.test(String(p.lastName ?? '').trim().toLowerCase());
}

/** ФИО в нужном падеже: 'genitive' (кого?) или 'accusative' (кого? — винительный). */
export function declineName(p, gcase) {
  const last = String(p.lastName ?? '').trim(), first = String(p.firstName ?? '').trim(), middle = String(p.middleName ?? '').trim();
  if (!last) return '';
  try {
    const r = petrovich({ last, first: first || undefined, middle: middle || undefined }, gcase);
    return [r.last, r.first, r.middle].filter(Boolean).join(' ');
  } catch {
    return [last, first, middle].filter(Boolean).join(' '); // не склонилось — оставляем как есть
  }
}

// ---------------- Сумма прописью ----------------

const ONES = [['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'], ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const plural = (n, [one, few, many]) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

function triad(n, fem) {
  const w = [HUNDREDS[Math.floor(n / 100)]];
  const t = n % 100;
  if (t >= 10 && t < 20) w.push(TEENS[t - 10]);
  else w.push(TENS[Math.floor(t / 10)], ONES[fem ? 1 : 0][t % 10]);
  return w.filter(Boolean).join(' ');
}

/** 780000.5 → «семьсот восемьдесят тысяч рублей 50 копеек» */
export function rubWords(sum) {
  const rubles = Math.floor(sum + 1e-9);
  const kop = Math.round((sum - rubles) * 100);
  const groups = [[1e9, false, ['миллиард', 'миллиарда', 'миллиардов']], [1e6, false, ['миллион', 'миллиона', 'миллионов']], [1e3, true, ['тысяча', 'тысячи', 'тысяч']]];
  let rest = rubles; const words = [];
  for (const [base, fem, forms] of groups) {
    const g = Math.floor(rest / base); rest %= base;
    if (g) words.push(triad(g, fem), plural(g, forms));
  }
  if (rest || !words.length) words.push(rest ? triad(rest, false) : 'ноль');
  return `${words.join(' ')} ${plural(rubles, ['рубль', 'рубля', 'рублей'])} ${String(kop).padStart(2, '0')} ${plural(kop, ['копейка', 'копейки', 'копеек'])}`;
}

/** Уполномоченный орган (УФНС) по суду; для СПб и Ленобласти — по адресу регистрации. */
export function authorityFor(court, regAddress = '') {
  if (!court) return '';
  if (court.id === 'spb' && /ленинградск/i.test(regAddress)) return 'УФНС России по Ленинградской области';
  return court.ufns ?? '';
}

/** Субъект РФ по суду; для судов на два субъекта — по адресу регистрации. */
export function subjectFor(court, regAddress = '') {
  if (!court) return '';
  if (court.id === 'spb') return /ленинградск/i.test(regAddress) ? 'Ленинградская область' : 'Санкт-Петербург';
  if (court.id === 'arkhangelsk') return /ненецк/i.test(regAddress) ? 'Ненецкий автономный округ' : 'Архангельская область';
  return court.region;
}

/** Данные для шаблонов. docs — отметки чек-листа, чтобы перечислить полученные документы в приложениях. */
export function buildView(p, R, path = 'court', docs = {}, answers = {}) {
  const court = R.courts.find((c) => c.id === p.courtId);
  const crAll = (p.creditors ?? []).map((c) => {
    const debt = amount(c.principal) + amount(c.interest);
    const total = debt + amount(c.penalties);
    return {
      ...c, typeText: typeText[c.type] ?? typeText.other,
      address: c.address || '—',
      principalText: rub(amount(c.principal)), interestText: rub(amount(c.interest)), penaltiesText: rub(amount(c.penalties)),
      debtText: rub(debt), totalText: rub(total),
    };
  });
  // Нумерация «1.1, 1.2…» как в форме по приказу Минэкономразвития № 530
  const numbered = (list, prefix) => list.map((c, i) => ({ ...c, n: `${prefix}${i + 1}` }));
  const isBiz = (c) => c.business === 'yes';
  const money = (biz) => numbered(crAll.filter((c) => c.type !== 'tax' && isBiz(c) === biz), '1.');
  const taxes = (biz) => numbered(crAll.filter((c) => c.type === 'tax' && isBiz(c) === biz), '2.');
  const sum = (k) => (p.creditors ?? []).reduce((s, c) => s + amount(c[k]), 0);
  const total = sum('principal') + sum('interest') + sum('penalties');
  const ini = (s) => (s ? `${s[0]}.` : '');
  const passport = p.passportSeries || p.passportNumber
    ? `серия ${digits(p.passportSeries)} № ${digits(p.passportNumber)}, выдан ${p.passportIssuedBy ?? ''} ${p.passportIssuedAt ?? ''}`.trim() : '';
  const incomes = (p.incomes ?? []).filter((r) => r.year || r.amount).map((r) => `${r.year} г. — ${r.source || 'доход'} — ${rub(amount(r.amount))} руб.`);
  const received = checklist(R, path, answers).filter((d) => (docs[d.id]?.status ?? (docs[d.id] === true ? 'received' : 'none')) === 'received').map((d) => d.title);
  const generated = path === 'court' ? ['Список кредиторов и должников гражданина', 'Опись имущества гражданина'] : [];
  const fullName = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');

  // Опись имущества по разделам формы
  const prop = (p.property ?? []).map((x) => ({
    ...x,
    kindText: kindText[x.kind] ?? kindText.other,
    ownText: ownText[x.ownership] ?? '—',
    addressText: x.address || '—', areaText: x.area || '—', vinText: x.vin || '—',
    basisText: [x.basis, x.value ? `${rub(amount(x.value))} руб.` : ''].filter(Boolean).join(', ') || '—',
    valueText: x.value ? `${rub(amount(x.value))} руб.` : '—',
    pledgeText: x.pledge === 'yes' ? `да${x.pledgee ? `, ${x.pledgee}` : ''}` : 'нет',
    description: x.description || '—',
    capitalText: x.capital ? `${rub(amount(x.capital))}` : '—', shareText: x.shareSize || '—', basisOnly: x.basis || '—',
    issuerText: x.issuer || '—', nominalText: x.nominal ? rub(amount(x.nominal)) : '—', qtyText: x.qty || '—',
  }));
  const section = (kinds, prefix) => numbered(prop.filter((x) => kinds.includes(x.kind)), prefix);
  const valuables = section(['valuables', 'other'], '6.');
  const cashRow = amount(p.cash) ? [{ n: '6.0', kindText: 'Наличные денежные средства', description: 'Наличные денежные средства', valueText: `${rub(amount(p.cash))} руб.`, addressText: p.liveAddress || p.regAddress || '—', pledgeText: 'нет' }] : [];

  // Блок «Информация о гражданине» в формах по приказу Минэкономразвития № 530
  const personRows = [
    ['Фамилия', p.lastName], ['Имя', p.firstName], ['Отчество (при наличии)', p.middleName],
    ['Прежние фамилии, имена, отчества', p.prevNames || 'не изменялись'],
    ['Дата рождения', p.birthDate], ['Место рождения', p.birthPlace], ['СНИЛС', p.snils], ['ИНН', digits(p.inn)],
    ['Документ, удостоверяющий личность', 'паспорт гражданина Российской Федерации'],
    ['Серия и номер', p.passportSeries || p.passportNumber ? `${digits(p.passportSeries)} ${digits(p.passportNumber)}` : ''],
    ['Адрес регистрации по месту жительства: субъект Российской Федерации', subjectFor(court, p.regAddress)],
    ['Адрес регистрации полностью', p.regAddress],
  ].map(([label, value]) => ({ label, value: String(value ?? '').trim() || '—' }));

  return {
    personRows,
    court: { name: court?.court ?? '', address: court?.address ?? '' },
    authority: authorityFor(court, p.regAddress),
    debtor: {
      fullName,
      fullNameGen: declineName(p, 'genitive') || fullName,
      fullNameAcc: declineName(p, 'accusative') || fullName,
      insolvent: isFemale(p) ? 'несостоятельной' : 'несостоятельным',
      shortName: p.lastName ? `${p.lastName} ${ini(p.firstName)}${ini(p.middleName)}` : '',
      lastName: p.lastName, firstName: p.firstName, middleName: p.middleName || '—', prevNames: p.prevNames || 'не изменялись',
      birthDate: p.birthDate, birthPlace: p.birthPlace, inn: digits(p.inn), snils: p.snils, passport,
      passportNo: p.passportSeries || p.passportNumber ? `${digits(p.passportSeries)} ${digits(p.passportNumber)}` : '',
      region: subjectFor(court, p.regAddress),
      regAddress: p.regAddress, liveAddress: p.liveAddress && p.liveAddress !== p.regAddress ? p.liveAddress : '',
      phone: p.phone, email: p.email,
    },
    debt: {
      totalText: total ? rub(total) : '', totalWords: total ? rubWords(total) : '',
      principalText: rub(sum('principal')), interestText: rub(sum('interest')), penaltiesText: rub(sum('penalties')),
    },
    creditors: numbered(crAll, ''),
    creditorsMoney: money(false), creditorsTax: taxes(false),
    creditorsBizMoney: money(true), creditorsBizTax: taxes(true),
    debtorsOfDebtor: numbered((p.receivables ?? []).map((x) => ({ ...x, address: x.address || '—', basis: x.basis || '—', amountText: rub(amount(x.amount)) })), '1.'),
    realty: section(['realty', 'land'], '1.'),
    vehicles: section(['car'], '2.'),
    shares: section(['share'], '4.'),
    securities: section(['securities'], '5.'),
    valuables: [...cashRow, ...valuables].map((x, i) => ({ ...x, n: `6.${i + 1}` })),
    property: numbered(prop, ''),
    accounts: numbered((p.accounts ?? []).map((x) => ({ ...x, bankText: x.bank || '—', typeText: x.accountType || 'текущий, рубль', openedText: x.opened || '—', balanceText: rub(amount(x.balance)) })), '3.'),
    deals: { hasAny: (p.deals ?? []).length > 0 },
    income: { text: [p.employment, ...incomes].filter(Boolean).join('; ') || 'сведения приведены в приложенных справках' },
    family: {
      text: [maritalText[p.maritalStatus], p.spouseName ? `супруг(а): ${p.spouseName}` : ''].filter(Boolean).join(', '),
      dependentsText: (p.dependents ?? []).map((d) => `${d.relation ?? ''} ${d.name}${d.birthDate ? `, ${d.birthDate} г. р.` : ''}`.trim()).join('; '),
    },
    circumstances: String(p.circumstances ?? '').trim(),
    request: { isRealization: p.procedure !== 'restructuring', isRestructuring: p.procedure === 'restructuring' },
    sro: { name: String(p.sro ?? '').trim() },
    deposit: { paid: !!p.depositPaid, amountText: rub(param(R, 'court.managerDeposit')) },
    attachments: [...generated, ...received].map((title, k) => ({ n: k + 1, title })),
    caseNumber: p.caseNumber || '__________', managerName: p.managerName || '__________',
    today: { year: String(new Date().getFullYear()) },
  };
}

const getPath = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

export function missing(t, view) {
  return t.required.filter((path) => {
    const v = getPath(view, path);
    return Array.isArray(v) ? !v.length : v === undefined || v === null || String(v).trim() === '';
  });
}

export function render(t, view) {
  const out = [];
  for (const b of t.blocks) {
    if (b.t === 'each') (getPath(view, b.source) ?? []).forEach((it) => out.push({ t: 'item', text: Mustache.render(b.text, { ...view, ...it }) }));
    else if (b.t === 'table') {
      const rows = getPath(view, b.source) ?? [];
      if (rows.length) out.push({ t: 'table', header: b.columns.map((c) => c.h), rows: rows.map((it) => b.columns.map((c) => Mustache.render(c.v, { ...view, ...it }))) });
    } else {
      const text = Mustache.render(b.text, view).trim();
      if (text) out.push({ t: b.t, text });
    }
  }
  return out;
}

/** Текст документа для копирования и пересылки. */
export function toPlainText(t, blocks) {
  const lines = blocks.map((b) => {
    if (b.t === 'table') return b.rows.map((r) => r.map((c, i) => `${b.header[i]}: ${c}`).join('; ')).join('\n');
    if (b.t === 'title' || b.t === 'center') return `\n${b.text.toUpperCase()}`;
    return b.text;
  });
  if (t.status !== 'approved') lines.push('\n[Черновик шаблона — не прошёл юридическую проверку]');
  return lines.join('\n\n');
}

export function draftCircumstances(reasons, since) {
  const map = {
    job: 'потерей работы', income: 'снижением дохода', ill: 'болезнью и расходами на лечение',
    family: 'ростом расходов на семью', divorce: 'расторжением брака', refinance: 'тем, что для погашения старых кредитов пришлось брать новые займы',
  };
  const list = reasons.map((r) => map[r]).filter(Boolean);
  if (!list.length) return '';
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} и ${list.at(-1)}`;
  return `${since?.trim() ? `Начиная с ${since.trim()} я` : 'Я'} перестал(а) справляться с исполнением обязательств перед кредиторами в полном объёме. Ухудшение финансового положения связано с ${joined}. Имеющегося дохода недостаточно для погашения задолженности и обеспечения минимальных потребностей. Полученные по кредитам деньги были израсходованы на [укажите, на что]. Сведения о доходах и имуществе мною раскрыты полностью.`;
}

// ---------------- Вопросы и ответы ----------------

const FRAUD = [
  /(?:^|[^а-я])(спрят|скры|утаи|вывест|вывод)[а-я]*\s.*(имуществ|квартир|машин|деньг|доход|актив|счет)/,
  /(?:^|[^а-я])(переписат|переоформ|перевест)[а-я]*\s.*(на\s+(жену|мужа|маму|мать|отца|папу|сына|дочь|родствен|друга|брата|сестру|супруг))/,
  /(фиктивн|поддел|липов|задн[а-я]*\s+числ)/,
  /чтобы\s+(не\s+забрали|не\s+нашли|не\s+узнал)/,
  /(обмануть|обойти)\s+(суд|управляющ|кредитор|пристав)/,
];
const IN_SCOPE = ['банкрот', 'долг', 'кредит', 'займ', 'мфо', 'мфц', 'суд', 'управляющ', 'пристав', 'коллектор', 'имуществ', 'квартир', 'жиль', 'ипотек', 'машин', 'зарплат', 'карт', 'счет', 'алимент', 'депозит', 'заявлен', 'документ', 'справк', 'списан', 'границ', 'супруг', 'сделк', 'пенси', 'налог', 'жкх'];
const GUARANTEE = [/гарант[а-я]*.*(спиш|списан)/, /(точно|100\s*%)\s.*(спиш|списан)/];

export function answer(question, R) {
  const q = question.toLowerCase().replace(/ё/g, 'е');
  if (FRAUD.some((r) => r.test(q))) return { kind: 'refusal', text: R.refusals.fraud, sources: [] };
  if (GUARANTEE.some((r) => r.test(q))) return { kind: 'refusal', text: R.refusals.guarantee, sources: [] };
  const words = q.replace(/[^а-яa-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const scored = R.knowledge
    .map((e) => {
      let s = 0;
      for (const kw of e.keywords) if (q.includes(kw.replace(/ё/g, 'е'))) s += 3;
      const qw = e.q.toLowerCase().replace(/ё/g, 'е').split(/\s+/);
      for (const w of words) if (qw.some((x) => x.startsWith(w.slice(0, 5)))) s += 1;
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) {
    const inScope = IN_SCOPE.some((k) => q.includes(k));
    return { kind: 'notFound', text: inScope ? R.refusals.notFound : R.refusals.outOfScope, sources: [] };
  }
  return { kind: 'answer', text: scored[0].e.a, sources: scored[0].e.sources, q: scored[0].e.q };
}
