import {
  answer, buildView, checkAmount, checkCreditorInn, checkDate, checkInn, checklist, checkPassNum, checkSeries, checkSnils,
  costText, courtByAddress, dateRu, diagnose, draftCircumstances, freshness, isAnswered, loadRules, missing, param, render,
  rub, stepErrors, toPlainText, validityDays, years,
} from './logic.js';
import { STEPS, stepsFor } from './form-schema.js';
import { loadState, saveState, wipe } from './storage.js';

// Юристы ООО «Арбитръ» — оператора сервиса (сложные случаи — отдельная платная услуга).
// max — ссылка на чат ООО «Арбитръ» в MAX вида https://max.ru/<имя>, если появится.
const PARTNER = { name: 'ООО «Арбитръ»', site: 'https://arbitr55.pro', max: '' };
// Ключ DaData (бесплатный тариф, dadata.ru → Личный кабинет → API) для заполнения кредитора по ИНН из ЕГРЮЛ.
// Пусто — кнопка «Заполнить по ИНН» не показывается. Передаётся только ИНН кредитора, данных пользователя нет.
const DADATA_TOKEN = '';
// Какие шаблоны доступны на каждом пути
const PAPERS = {
  court: ['court_application', 'creditors_list', 'property_inventory', 'deposit_motion', 'attach_motion', 'manager_letter'],
  outOfCourt: ['mfc_data'],
};
const TERM_NAMES = {
  enforcement: 'Исполнительное производство', insolvency: 'Неплатёжеспособность', manager: 'Финансовый управляющий',
  restructuring: 'Реструктуризация', realization: 'Реализация имущества', efrsb: 'ЕФРСБ', deposit: 'Депозит',
};
const levelText = { green: 'Всё понятно', yellow: 'Есть нюансы', red: 'Сложный случай' };
const statusText = { none: 'Нет', ordered: 'Заказал(а)', received: 'Получил(а) / в наличии' };

const app = document.getElementById('app');
let WA = null; // window.WebApp из MAX Bridge — появляется после загрузки скрипта
let inMax = false;
let R; // база правил
let S; // состояние пользователя

const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const save = () => saveState(S);
const path = () => S.diagnosis?.path ?? 'court';
// Вызов метода MAX Bridge без шума: вне MAX и на старых клиентах методы отвечают отказом.
const bridge = (fn) => {
  if (!inMax) return;
  try { Promise.resolve(fn()).catch(() => {}); } catch { /* метода нет */ }
};
const haptic = () => bridge(() => WA.HapticFeedback.selectionChanged());

/** Своё окно подтверждения: window.confirm во встроенных браузерах мессенджеров может не работать. */
function ask(text, okText = 'Да') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><p>${h(text)}</p>
      <button class="btn" data-ok>${h(okText)}</button><button class="btn ghost" data-cancel>Отмена</button></div>`;
    wrap.addEventListener('click', (e) => {
      const ok = e.target.closest('[data-ok]');
      if (ok || e.target.closest('[data-cancel]') || e.target === wrap) { wrap.remove(); resolve(!!ok); }
    });
    document.body.append(wrap);
    wrap.querySelector('[data-ok]').focus();
  });
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('Текст скопирован');
}

/** Логотип и подпись ООО «Арбитръ» со ссылкой на сайт. */
const brand = () => `
  <div class="brand">
    <img src="arbitr-logo.png" alt="Логотип ООО «Арбитръ»" width="44" height="64">
    <p>ООО «Арбитръ» — <button class="link" data-partner-site>arbitr55.pro</button></p>
  </div>`;

const progressBar = (v) => `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><i style="width:${v * 100}%"></i></div>`;
const rulesLine = () => `<p class="muted center">Правила актуальны на ${dateRu(R.checkedAt)}</p>`;

// ---------------- Навигация ----------------

const go = (hash) => { location.hash = hash; };
const back = () => (history.length > 1 ? history.back() : go('#/'));

function route(keepScroll = false) {
  const y = window.scrollY;
  const [, name = '', arg] = location.hash.replace(/^#/, '').split('/');
  const open = ['welcome', 'legal'];
  if (!S.consent && !open.includes(name)) return go('#/welcome');
  const screens = { '': home, welcome, legal, test, result, docs, doc, stages, faq, form, step, papers, paper, lawyer, settings };
  const screen = screens[name] ?? home;
  const top = name && name !== 'welcome' && !inMax ? '<div class="top"><button class="back" data-back>‹ Назад</button></div>' : '';
  app.innerHTML = top + screen(arg);
  window.scrollTo(0, keepScroll ? y : 0);
  bridge(() => (name && name !== 'welcome' ? WA.BackButton.show() : WA.BackButton.hide()));
  if (name === 'step') updateStepErrors(arg);
}

// ---------------- Онбординг ----------------

const slides = [
  ['Что я умею', ['Покажу, подходит ли вам банкротство и какой путь выбрать: через МФЦ или через суд.', 'Составлю личный список документов и подскажу, где их взять.', 'Заполню шаблоны заявлений вашими данными и проведу по этапам.'], 'Это нормально — многие проходят через это. Разберёмся по шагам.'],
  ['Чего я не делаю', ['Не заменяю юриста и не представляю вас в суде.', 'Не обещаю списание долгов — решение принимает суд или закон.', 'Не помогаю скрывать имущество и доходы: за это отказывают в списании.'], 'Сервис сделан юристами ООО «Арбитръ». Сам он бесплатный, а помощь юристов по делу — отдельная платная услуга, по желанию.'],
  ['Ваши данные', ['Ответы и анкета хранятся только на вашем телефоне, данные анкеты — в защищённом хранилище MAX.', 'У сервиса нет своего сервера — мы не видим ваших данных.', 'Удалить всё можно одной кнопкой в разделе «Мои данные».'], 'Документы уходят из телефона, только когда вы сами их копируете или отправляете.'],
];

function welcome() {
  const i = S.ob ?? 0;
  if (i < slides.length) {
    const [title, points, note] = slides[i];
    return `
      ${i === 0 ? brand() : ''}
      <p class="muted">Шаг ${i + 1} из ${slides.length + 1}</p>${progressBar((i + 1) / (slides.length + 1))}
      <h1>${title}</h1>
      <div class="card"><ul class="plain">${points.map((p) => `<li>${h(p)}</li>`).join('')}</ul></div>
      <p class="muted">${h(note)}</p>
      <button class="btn" data-ob="${i + 1}">Дальше</button>
      ${i > 0 ? `<button class="btn ghost" data-ob="${i - 1}">Назад</button>` : ''}`;
  }
  const c = S.pending ?? {};
  const opt = (k, label, doc) => `
    <button class="option multi" role="checkbox" aria-checked="${!!c[k]}" data-consent="${k}"><span class="mark"></span><span>${label}</span></button>
    <button class="btn ghost small" data-go="#/legal/${doc}">Прочитать: ${h(R.legal.docs[doc].title.toLowerCase())}</button>`;
  return `
    <p class="muted">Шаг ${slides.length + 1} из ${slides.length + 1}</p>${progressBar(1)}
    <h1>Согласия</h1>
    <p>Сервис — справочный инструмент и генератор шаблонов. Он не заменяет юриста и не гарантирует решение суда.</p>
    ${opt('terms', 'Принимаю пользовательское соглашение и политику конфиденциальности', 'terms')}
    ${opt('pd', 'Даю согласие на обработку моих персональных данных на моём устройстве для подготовки документов', 'consent')}
    <button class="btn" data-start ${c.terms && c.pd ? '' : 'disabled'}>Начать</button>
    <button class="btn ghost" data-ob="${slides.length - 1}">Назад</button>`;
}

function legal(id) {
  const d = R.legal.docs[id];
  if (!d) return '<h1>Документ не найден</h1>';
  return `
    <h1>${h(d.title)}</h1>
    ${R.legal.status !== 'approved' ? '<p class="notice warn">Черновик: текст проходит юридическую проверку.</p>' : ''}
    ${d.sections.map(([t, body]) => `<div class="card"><h2>${h(t)}</h2><p>${h(body.replace('{{operator}}', R.legal.operator))}</p></div>`).join('')}
    <button class="btn secondary" data-back>Вернуться</button>`;
}

// ---------------- Главная ----------------

function home() {
  const d = S.diagnosis;
  const items = d ? checklist(R, d.path, S.answers) : [];
  const done = items.filter((i) => docStatus(i.id) === 'received').length;
  const steps = stepsFor(path());
  const stepsDone = steps.filter((s) => stepDone(s.id)).length;
  return `
    ${brand()}
    <h1>Банкротство без паники</h1>
    ${d ? `
      <button class="card accent" data-go="#/result">
        <span class="muted">Ваш путь</span>
        <span class="title">${d.path === 'outOfCourt' ? 'Через МФЦ — бесплатно' : 'Через арбитражный суд'}</span>
        <span class="badge ${d.level}">${levelText[d.level]}</span>
      </button>` : `
      <button class="card accent" data-go="#/test">
        <span class="title">Подхожу ли я?</span>
        <span class="muted">13 простых вопросов, около 3 минут</span>
      </button>`}
    <button class="card" data-go="#/docs">
      <span class="title">1. Документы</span>
      <span class="muted">${d ? `Собрано ${done} из ${items.length}` : 'Список появится после теста'}</span>
      ${d ? progressBar(items.length ? done / items.length : 0) : ''}
    </button>
    <button class="card" data-go="#/form">
      <span class="title">2. Анкета</span>
      <span class="muted">Заполнено шагов: ${stepsDone} из ${steps.length}</span>
      ${progressBar(stepsDone / steps.length)}
    </button>
    <button class="card" data-go="#/papers">
      <span class="title">3. Заявление и документы для суда</span>
      <span class="muted">Приложение составит текст по вашей анкете</span>
    </button>
    <button class="card" data-go="#/stages">
      <span class="title">Этапы процедуры</span>
      <span class="muted">Что происходит и что делать на каждом шаге</span>
    </button>
    <button class="card" data-go="#/faq">
      <span class="title">Вопросы и ответы</span>
      <span class="muted">Жильё, зарплата, коллекторы, поездки, словарь терминов</span>
    </button>
    <button class="card" data-go="#/lawyer">
      <span class="title">Помощь юриста</span>
      <span class="muted">Для сложных случаев — юристы ООО «Арбитръ», платно</span>
    </button>
    <button class="btn ghost" data-go="#/settings">Мои данные и настройки</button>
    ${rulesLine()}`;
}

// ---------------- Тест и результат ----------------

function test() {
  const qs = R.questions;
  const i = Math.min(S.qi ?? 0, qs.length - 1);
  const q = qs[i];
  const v = S.answers[q.id];
  const body = q.type === 'number'
    ? `<label class="field"><span>Сумма, ₽</span>
         <input id="num" inputmode="numeric" type="text" placeholder="Например, 650000" value="${typeof v === 'number' ? v : ''}">
       </label><p class="muted" id="numHint">${typeof v === 'number' ? `${rub(v)} ₽` : ''}</p>`
    : q.options.map((o) => {
        const sel = Array.isArray(v) ? v.includes(o.value) : v === o.value;
        return `<button class="option ${q.type === 'multi' ? 'multi' : ''}" role="${q.type === 'multi' ? 'checkbox' : 'radio'}" aria-checked="${sel}" data-answer="${h(o.value)}"><span class="mark"></span><span>${h(o.label)}</span></button>`;
      }).join('');
  return `
    <p class="muted">Вопрос ${i + 1} из ${qs.length}</p>${progressBar((i + 1) / qs.length)}
    <h1>${h(q.text)}</h1>
    ${q.hint ? `<p class="muted">${h(q.hint)}</p>` : ''}
    ${q.term && R.terms[q.term] ? `<details class="card"><summary>Что такое «${h(TERM_NAMES[q.term]?.toLowerCase() ?? q.term)}»?</summary>${h(R.terms[q.term])}</details>` : ''}
    ${body}
    <button class="btn" data-next ${isAnswered(q, S.answers) ? '' : 'disabled'}>${i === qs.length - 1 ? 'Показать результат' : 'Дальше'}</button>
    ${i > 0 ? '<button class="btn ghost" data-prev>Назад к прошлому вопросу</button>' : ''}
    <p class="muted center">Ответы хранятся только на вашем телефоне.</p>`;
}

function result() {
  const d = S.diagnosis;
  if (!d) return `<h1>Сначала пройдите тест</h1><button class="btn" data-go="#/test">Пройти тест</button>`;
  return `
    <h1>${d.path === 'outOfCourt' ? 'Вам может подойти банкротство через МФЦ' : 'Ваш путь — арбитражный суд'}</h1>
    <p>${h(d.summary)}</p>
    <div class="card level ${d.level}">
      <span class="badge ${d.level}" style="background:var(--card)">${levelText[d.level]}</span>
      <p>${{
        green: 'Серьёзных осложнений не видно. Процедуру можно пройти самостоятельно.',
        yellow: 'Есть моменты, к которым стоит подготовиться. Пройти самостоятельно можно — прочитайте пояснения ниже.',
        red: 'Ситуация сложнее обычной. Самостоятельный путь доступен, но ошибка может стоить имущества или списания долгов. Советуем хотя бы одну консультацию юриста.',
      }[d.level]}</p>
    </div>
    <div class="card">
      <h2>Через МФЦ</h2>
      <span class="badge ${d.ocOk ? 'green' : 'plain'}">${d.ocOk ? 'Похоже, подходит' : 'Скорее не подходит'}</span>
      <p>${h(d.ocWhy)}</p>
      <p class="muted">ст. 223.2 127-ФЗ. МФЦ сам проверяет сведения у приставов.</p>
    </div>
    ${d.path === 'court' ? `
      <div class="card">
        <h2>Через суд: что нужно знать</h2>
        <ul class="plain">
          <li>Депозит на вознаграждение финансового управляющего — ${rub(param(R, 'court.managerDeposit'))} ₽.</li>
          <li>Плюс госпошлина, почта и публикации.</li>
          ${d.mandatory ? `<li>При долге больше ${rub(param(R, 'court.mandatoryFilingThreshold'))} ₽ подать заявление — обязанность (п. 1 ст. 213.4 127-ФЗ).</li>` : ''}
        </ul>
      </div>` : ''}
    ${d.flags.length ? '<h2>На что обратить внимание</h2>' : ''}
    ${d.flags.map((f) => `
      <div class="card">
        <span class="badge ${f.level}">${levelText[f.level]}</span>
        <h2>${h(f.title)}</h2><p>${h(f.text)}</p>${f.source ? `<p class="muted">${h(f.source)}</p>` : ''}
      </div>`).join('')}
    <div class="card">
      <h2>Последствия банкротства</h2>
      <ul class="plain">
        <li>${years(param(R, 'consequences.creditDisclosureYears'))} нужно сообщать о банкротстве, когда берёте кредит.</li>
        <li>${years(param(R, 'consequences.refileBanYears'))} нельзя снова подать на своё банкротство.</li>
        <li>${years(param(R, 'consequences.managementBanYears'))} нельзя руководить компаниями.</li>
        <li>Не спишут: ${h(R.nonDischargeable.map((x) => x.title.toLowerCase()).join('; '))}.</li>
      </ul>
      <p class="muted">ст. 213.28, 213.30 127-ФЗ</p>
    </div>
    <p class="notice">Это предварительная оценка по вашим ответам, а не юридическое заключение.</p>
    <button class="btn" data-go="#/docs">Какие документы собрать</button>
    <button class="btn ${d.level === 'red' ? 'secondary' : 'ghost'}" data-go="#/lawyer">Помощь юриста</button>
    <button class="btn ghost" data-retest>Пройти тест заново</button>`;
}

// ---------------- Документы (чек-лист) ----------------

/** Статус документа; старый формат (true) считаем «получил». */
const docStatus = (id) => {
  const v = S.docs?.[id];
  return v === true ? 'received' : v?.status ?? 'none';
};
const docState = (id) => (S.docs?.[id] === true ? { status: 'received' } : S.docs?.[id]);

function docs() {
  const d = S.diagnosis;
  if (!d) return `<h1>Документы</h1><p>Список составляется по вашим ответам в тесте.</p><button class="btn" data-go="#/test">Пройти тест</button>`;
  const items = checklist(R, d.path, S.answers);
  const done = items.filter((i) => docStatus(i.id) === 'received').length;
  return `
    <h1>Документы</h1>
    <p class="muted">В наличии: ${done} из ${items.length}. Нажмите на документ, чтобы узнать, где его взять, и отметить статус.</p>
    ${progressBar(items.length ? done / items.length : 0)}
    ${items.map((i) => {
      const st = docStatus(i.id);
      const fr = freshness(i, docState(i.id), R);
      return `
        <button class="card" data-go="#/doc/${i.id}">
          <span class="title">${h(i.title)}</span>
          <span class="muted">${h(i.where)}</span><br>
          <span class="badge ${st === 'received' ? 'green' : st === 'ordered' ? 'yellow' : 'plain'}">${statusText[st]}</span>
          ${fr === 'soon' ? '<span class="badge yellow">Скоро устареет</span>' : ''}
          ${fr === 'expired' ? '<span class="badge red">Нужна свежая справка</span>' : ''}
        </button>`;
    }).join('')}
    <button class="btn secondary" data-copy-list>Скопировать список</button>
    ${inMax ? '' : '<button class="btn ghost" data-print>Распечатать список</button>'}
    <p class="muted">Перечень по п. 3 ст. 213.4 127-ФЗ. Суд может попросить дополнительные документы.</p>`;
}

function doc(id) {
  const i = R.documents.find((x) => x.id === id);
  if (!i) return '<h1>Документ не найден</h1>';
  const st = docState(id) ?? { status: 'none' };
  const days = validityDays(i, R);
  const until = st.status === 'received' && st.at && days ? dateRu(new Date(new Date(st.at).getTime() + days * 86400000).toISOString()) : '';
  return `
    <h1>${h(i.title)}</h1>
    <div class="card">
      <p><b>Зачем:</b> ${h(i.why)}</p>
      <p><b>Где взять:</b> ${h(i.where)}</p>
      <p><b>Как:</b> ${h(i.how)}</p>
      <p class="muted">Срок изготовления: ${h(i.leadTime)} · Стоимость: ${h(costText(i, R))}${days ? ` · Справка свежая около ${days} дн.` : ''}</p>
      ${until ? `<p class="muted">Актуальна примерно до ${until}</p>` : ''}
    </div>
    <h2>Статус</h2>
    ${Object.entries(statusText).map(([k, l]) => `<button class="option" role="radio" aria-checked="${st.status === k}" data-doc-status="${k}" data-doc-id="${id}"><span class="mark"></span><span>${l}</span></button>`).join('')}
    <label class="field"><span>Заметка</span><input type="text" data-doc-note="${id}" placeholder="Например: заказал в банке 12.10" value="${h(st.note ?? '')}"></label>`;
}

function checklistText() {
  const items = checklist(R, path(), S.answers);
  return `Документы для банкротства (правила от ${dateRu(R.checkedAt)}):\n\n${items.map((i, k) => `${k + 1}. [${docStatus(i.id) === 'received' ? '✓' : ' '}] ${i.title} — ${i.where}`).join('\n')}`;
}

// ---------------- Этапы ----------------

function stages() {
  const p = S.stagesPath ?? path();
  const list = R.timeline[p];
  const cur = (S.stagePath ?? path()) === p ? list.findIndex((s) => s.id === S.stage) : -1;
  return `
    <h1>Этапы процедуры</h1>
    <div class="row" style="margin-bottom:12px">
      <button class="btn ${p === 'court' ? '' : 'secondary'}" data-path="court">Через суд</button>
      <button class="btn ${p === 'outOfCourt' ? '' : 'secondary'}" data-path="outOfCourt">Через МФЦ</button>
    </div>
    ${list.map((s, i) => `
      <details class="card stage ${i < cur ? 'done' : i === cur ? 'current' : ''}" ${i === cur ? 'open' : ''}>
        <summary>Шаг ${i + 1}. ${h(s.title)} <span class="muted">· ${h(s.typical)}${i === cur ? ' · вы здесь' : ''}</span></summary>
        <p>${h(s.what)}</p>
        ${s.todo.length ? `<p class="muted">Что делать</p><ul class="plain">${s.todo.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
        ${s.dont.length ? `<p class="muted">Чего нельзя делать</p><ul class="plain">${s.dont.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
        ${i !== cur ? `<button class="btn secondary" data-stage="${s.id}" data-stage-path="${p}">Я на этом этапе</button>` : ''}
        <button class="btn ghost" data-ask="${h(s.title)}">Вопрос по этому этапу</button>
      </details>`).join('')}
    ${rulesLine()}`;
}

// ---------------- Вопросы и ответы ----------------

function faq() {
  const a = S.lastAnswer;
  return `
    <h1>Вопросы и ответы</h1>
    <label class="field"><span>Ваш вопрос</span>
      <input id="q" type="search" placeholder="Например: заберут ли машину?" value="${h(S.lastQuestion ?? '')}">
    </label>
    <button class="btn" data-ask-q>Найти ответ</button>
    <p class="muted">Не пишите сюда паспортные данные — они не нужны для ответа.</p>
    ${a ? `
      <div class="card">
        ${a.q ? `<span class="title">${h(a.q)}</span>` : ''}
        <p class="chat-answer">${h(a.text)}</p>
        ${a.sources?.length ? `<p class="muted">Источник: ${h(a.sources.join('; '))}</p>` : ''}
        <p class="muted">Справочная информация по правилам от ${dateRu(R.checkedAt)}, не юридическая консультация.</p>
        ${a.kind !== 'answer' ? '<button class="btn secondary" data-go="#/lawyer">Спросить юриста</button>' : ''}
      </div>` : ''}
    <h2 style="margin-top:20px">Частые вопросы</h2>
    ${R.knowledge.map((k) => `<details class="card"><summary>${h(k.q)}</summary><p>${h(k.a)}</p><p class="muted">${h(k.sources.join('; '))}</p></details>`).join('')}
    <h2 style="margin-top:20px">Словарь</h2>
    ${Object.entries(R.terms).map(([k, t]) => `<details class="card"><summary>${h(TERM_NAMES[k] ?? k)}</summary><p>${h(t)}</p></details>`).join('')}`;
}

// ---------------- Анкета ----------------

const CHECKS = {
  dateReq: (v) => checkDate(v, true), date: (v) => checkDate(v), inn: checkInn, snils: checkSnils,
  series: checkSeries, passNum: checkPassNum, amount: checkAmount, creditorInn: checkCreditorInn,
};
const stepDone = (id) => (S.stepsSeen ?? []).includes(id) && !stepErrors(id, S.profile).length;

function form() {
  const steps = stepsFor(path());
  const done = steps.filter((s) => stepDone(s.id)).length;
  return `
    <h1>Анкета</h1>
    <p class="muted">Заполнено ${done} из ${steps.length}. Всё сохраняется на вашем телефоне автоматически — можно заполнять частями.</p>
    ${progressBar(done / steps.length)}
    ${!S.diagnosis ? '<p class="notice">Пройдите тест — тогда анкета подстроится под ваш путь (для МФЦ нужно меньше данных).</p>' : ''}
    ${steps.map((s, i) => `
      <button class="card" data-go="#/step/${s.id}">
        <span class="muted">Шаг ${i + 1} из ${steps.length}</span>
        <span class="title">${h(s.title)}</span>
        <span class="muted">${h(s.hint)}</span><br>
        <span class="badge ${stepDone(s.id) ? 'green' : 'plain'}">${stepDone(s.id) ? 'Готово' : 'Заполнить'}</span>
      </button>`).join('')}
    <button class="btn" data-go="#/papers">К документам</button>`;
}

function fieldHtml(f, value, attrs, listIndex) {
  const err = f.check && value ? CHECKS[f.check](value) : null;
  const control = f.select
    ? `<select ${attrs} aria-label="${h(f.l)}">${f.select.map(([v, l]) => `<option value="${v}" ${String(value ?? f.select[0][0]) === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`
    : `<input type="text" ${attrs} ${f.mode ? `inputmode="${f.mode}"` : ''} placeholder="${h(f.ph ?? '')}" value="${h(value ?? '')}" aria-label="${h(f.l)}">`;
  return `<label class="field"><span>${h(f.l)}</span>${control}
    ${f.check ? `<div class="err" data-err>${h(err ?? '')}</div>` : ''}
    ${f.hint ? `<span class="muted">${h(f.hint)}</span>` : ''}
    ${f.contact && inMax ? '<button class="btn ghost small" data-contact>Взять номер из MAX</button>' : ''}
    ${f.innFill && DADATA_TOKEN ? `<button class="btn ghost small" data-inn-fill="${listIndex}">Заполнить название и адрес по ИНН</button>` : ''}</label>`;
}

function step(id) {
  const steps = stepsFor(path());
  const idx = steps.findIndex((s) => s.id === id);
  const s = STEPS.find((x) => x.id === id);
  if (!s) return '<h1>Шаг не найден</h1>';
  const p = S.profile;
  const fields = (s.fields ?? []).map((f) => (f.row
    ? `<div class="row">${f.row.map((x) => fieldHtml(x, p[x.k], `data-field="${x.k}" data-check="${x.check ?? ''}"`)).join('')}</div>`
    : fieldHtml(f, p[f.k], `data-field="${f.k}" data-check="${f.check ?? ''}"`))).join('');
  const lists = (s.lists ?? []).map((L) => `
    ${L.title !== s.title ? `<h2 style="margin-top:16px">${h(L.title)}</h2>` : ''}
    ${L.note ? `<p class="muted">${h(L.note)}</p>` : ''}
    ${(p[L.key] ?? []).map((item, i) => `
      <div class="card">
        <h2>${h(L.item)} ${i + 1}</h2>
        ${L.fields.filter((f) => !f.when || f.when.includes(item.kind ?? 'realty')).map((f) => fieldHtml(f, item[f.k], `data-list="${L.key}" data-i="${i}" data-k="${f.k}" data-check="${f.check ?? ''}"`, i)).join('')}
        <button class="btn ghost" data-list-del="${L.key}" data-i="${i}">Удалить</button>
      </div>`).join('')}
    <button class="btn secondary" data-list-add="${L.key}">${h(L.add)}</button>`).join('');
  return `
    <p class="muted">Шаг ${idx + 1} из ${steps.length}</p>${progressBar((idx + 1) / steps.length)}
    <h1>${h(s.title)}</h1>
    ${s.note ? `<p class="notice">${h(s.note)}</p>` : ''}
    ${s.id === 'deals' ? `<p class="muted">Порог: ${rub(param(R, 'court.dealDisclosureThreshold'))} ₽.</p>` : ''}
    ${fields}${lists}${s.custom === 'court' ? courtStep() : ''}
    <div class="notice warn" id="stepErrors"></div>
    <button class="btn" data-step-next="${id}">${idx < steps.length - 1 ? 'Сохранить и дальше' : 'Сохранить'}</button>
    ${idx > 0 ? `<button class="btn ghost" data-go="#/step/${steps[idx - 1].id}">Назад к прошлому шагу</button>` : ''}`;
}

function courtStep() {
  const p = S.profile;
  const court = R.courts.find((c) => c.id === p.courtId);
  const reasons = [['job', 'Потеря работы'], ['income', 'Снижение дохода'], ['ill', 'Болезнь'], ['family', 'Рост расходов на семью'], ['divorce', 'Развод'], ['refinance', 'Новые займы, чтобы гасить старые']];
  return `
    <h2>Суд</h2>
    <p class="muted">Заявление подаётся в арбитражный суд региона, где вы зарегистрированы (п. 1 ст. 33 127-ФЗ).</p>
    <div class="card" id="court">${court ? `<span class="title">${h(court.court)}</span><span class="muted">Адрес и реквизиты депозита — на сайте суда</span>` : '<span class="muted">Суд не определился по адресу — выберите регион.</span>'}</div>
    <select data-field="courtId" aria-label="Арбитражный суд">
      <option value="">Выбрать регион…</option>
      ${R.courts.map((c) => `<option value="${c.id}" ${c.id === p.courtId ? 'selected' : ''}>${h(c.region)}</option>`).join('')}
    </select>
    <div style="height:12px"></div>
    ${fieldHtml({ l: 'Саморегулируемая организация управляющих (СРО)', hint: 'Суд утвердит управляющего из этой СРО. Список — на fedresurs.ru' }, p.sro, 'data-field="sro"')}
    <h2>О чём просить суд</h2>
    <button class="option" role="radio" aria-checked="${p.procedure !== 'restructuring'}" data-proc="realization"><span class="mark"></span><span>Продажа имущества и списание долгов — если дохода не хватает</span></button>
    <button class="option" role="radio" aria-checked="${p.procedure === 'restructuring'}" data-proc="restructuring"><span class="mark"></span><span>План погашения частями — если доход стабильный</span></button>
    ${fieldHtml({ l: `Депозит ${rub(param(R, 'court.managerDeposit'))} ₽ на счёт суда`, select: [['', 'ещё не внесён'], ['yes', 'уже внесён']] }, p.depositPaid ? 'yes' : '', 'data-field="depositPaid"')}
    <h2>Как появились долги</h2>
    <p class="muted">Отметьте причины — приложение предложит черновик. Обязательно перепишите его своими словами: суд читает этот раздел внимательно.</p>
    ${reasons.map(([rid, l]) => `<button class="option multi" role="checkbox" aria-checked="${(S.reasons ?? []).includes(rid)}" data-reason="${rid}"><span class="mark"></span><span>${l}</span></button>`).join('')}
    ${fieldHtml({ l: 'Примерно с какого времени', ph: 'например, марта 2024 года' }, S.since, 'data-since')}
    <button class="btn secondary" data-draft>Предложить черновик</button>
    <label class="field"><span>Обстоятельства образования долга</span><textarea data-field="circumstances">${h(p.circumstances ?? '')}</textarea></label>
    <h2>После подачи (если уже есть)</h2>
    ${fieldHtml({ l: 'Номер дела', ph: 'А46-12345/2026' }, p.caseNumber, 'data-field="caseNumber"')}
    ${fieldHtml({ l: 'ФИО финансового управляющего' }, p.managerName, 'data-field="managerName"')}`;
}

function updateStepErrors(id) {
  const box = document.getElementById('stepErrors');
  if (!box) return;
  const e = stepErrors(id, S.profile);
  box.style.display = e.length ? '' : 'none';
  box.textContent = e.length ? `Осталось: ${e.slice(0, 6).join('; ')}${e.length > 6 ? '…' : ''}` : '';
}

// ---------------- Документы для подачи ----------------

const view = () => buildView(S.profile, R, path(), S.docs ?? {}, S.answers);

function papers() {
  const v = view();
  return `
    <h1>Документы для подачи</h1>
    <p>Приложение заполняет шаблоны данными из анкеты. Перед тем как забрать текст — обязательная самопроверка.</p>
    ${(PAPERS[path()] ?? []).map((id) => {
      const t = R.templates.find((x) => x.id === id);
      const miss = missing(t, v);
      return `
        <button class="card" data-go="#/paper/${id}">
          <span class="title">${h(t.title)}</span>
          <span class="badge ${miss.length ? 'yellow' : 'green'}">${miss.length ? `Не хватает данных: ${miss.length}` : 'Данные заполнены'}</span>
          ${t.status !== 'approved' ? '<span class="badge plain">Шаблон на юр. проверке</span>' : ''}
        </button>`;
    }).join('')}
    <button class="btn secondary" data-go="#/form">Открыть анкету</button>`;
}

const fieldNames = {
  'court.name': 'суд', 'debtor.fullName': 'ФИО', 'debtor.birthDate': 'дата рождения', 'debtor.birthPlace': 'место рождения',
  'debtor.snils': 'СНИЛС', 'debtor.inn': 'ИНН', 'debtor.regAddress': 'адрес', 'debt.totalText': 'суммы долгов',
  circumstances: 'обстоятельства', creditors: 'кредиторы', 'sro.name': 'СРО', 'debtor.passport': 'паспорт', 'deposit.amountText': 'сумма депозита',
};

function paper(id) {
  const t = R.templates.find((x) => x.id === id);
  if (!t) return '<h1>Документ не найден</h1>';
  const v = view();
  const miss = missing(t, v);
  const circNotReady = t.required.includes('circumstances') && String(S.profile.circumstances ?? '').includes('[');
  const blocks = render(t, v);
  const checks = S.paperChecks?.[id] ?? [];
  const items = ['Я проверил(а) ФИО, даты и номера документов', 'Все кредиторы указаны, суммы сверены со справками и кредитной историей', 'Имущество, счета и сделки указаны честно и полностью', 'Я понимаю: это шаблон, за содержание и подачу отвечаю я'];
  const ready = !miss.length && !circNotReady && items.every((_, i) => checks[i]);
  const html = blocks.map((b) => (b.t === 'table'
    ? `<table><tr>${b.header.map((x) => `<th>${h(x)}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join('')}</tr>`).join('')}</table>`
    : `<p class="${b.t}">${h(b.text)}</p>`)).join('');
  return `
    <h1>${h(t.title)}</h1>
    ${t.status !== 'approved' ? '<p class="notice warn">Шаблон ещё проходит юридическую проверку — в тексте будет пометка «черновик».</p>' : ''}
    ${miss.length || circNotReady ? `<div class="notice warn">Не хватает данных: ${h([...miss.map((m) => fieldNames[m] ?? m), ...(circNotReady ? ['замените текст в квадратных скобках'] : [])].join(', '))}. <button class="back" data-go="#/form">Заполнить ›</button></div>` : ''}
    <div class="paper">${html}</div>
    <h2>Проверьте перед подачей</h2>
    ${items.map((l, i) => `<button class="option multi" role="checkbox" aria-checked="${!!checks[i]}" data-pcheck="${i}" data-pid="${id}"><span class="mark"></span><span>${l}</span></button>`).join('')}
    <button class="btn" data-copy="${id}" ${ready ? '' : 'disabled'}>Скопировать текст</button>
    ${inMax
      ? `<button class="btn secondary" data-share="${id}" ${ready ? '' : 'disabled'}>Отправить себе в чат MAX</button>`
      : `<button class="btn secondary" data-word="${id}" ${ready ? '' : 'disabled'}>Скачать для Word</button>
         <button class="btn secondary" data-print ${ready ? '' : 'disabled'}>Распечатать или сохранить PDF</button>`}
    ${!ready ? '<p class="muted">Кнопки станут активны, когда все данные заполнены и отмечены пункты проверки.</p>' : ''}
    <p class="muted">${inMax ? 'Вставьте текст в Word или Google Документы, проверьте, распечатайте и подпишите.' : 'Проверьте документ, распечатайте и подпишите.'} Основание: ${h(t.legalBasis)}.</p>`;
}

/** Документ Word из HTML — открывается в Word, LibreOffice и Google Документах. */
function downloadWord(t, blocks) {
  const body = blocks.map((b) => (b.t === 'table'
    ? `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:10pt"><tr>${b.header.map((x) => `<th>${h(x)}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join('')}</tr>`).join('')}</table>`
    : `<p style="${{ right: 'margin-left:50%', title: 'text-align:center;font-weight:bold;margin-top:18pt', subtitle: 'text-align:center', center: 'text-align:center;font-weight:bold', note: 'font-style:italic;font-size:10pt' }[b.t] ?? 'text-align:justify;text-indent:1.25cm'}">${h(b.text)}</p>`)).join('');
  const draft = t.status !== 'approved' ? '<p style="font-size:9pt;color:#666">Черновик шаблона — не прошёл юридическую проверку.</p>' : '';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${h(t.title)}</title>
    <style>@page{size:A4;margin:2cm 1.5cm 2cm 3cm}body{font-family:"Times New Roman";font-size:12pt}</style></head><body>${body}${draft}</body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }));
  a.download = `${t.title.replace(/[^а-яА-ЯёЁa-zA-Z0-9]+/g, '_')}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- Юрист ----------------

const leadReady = () => {
  const L = S.lead ?? {};
  return !!(L.consent && String(L.name ?? S.profile.firstName ?? '').trim() && String(L.contact ?? S.profile.phone ?? '').trim());
};

function lawyer() {
  const L = S.lead ?? {};
  const d = S.diagnosis;
  return `
    <h1>Помощь юриста</h1>
    <div class="card">
      <p>Если у вас ипотека, сделки с имуществом за последние 3 года, бывший бизнес или споры с кредиторами, лучше хотя бы раз посоветоваться с юристом.</p>
      <p>Этот сервис сделали юристы ${PARTNER.name}. Сам сервис бесплатный, а помощь юристов по вашему делу — <b>отдельная платная услуга</b>. Стоимость обсудите до начала работы. Пользоваться ей не обязательно: весь путь можно пройти самостоятельно.</p>
    </div>
    <label class="field"><span>Как к вам обращаться</span><input type="text" data-lead="name" value="${h(L.name ?? S.profile.firstName ?? '')}"></label>
    <label class="field"><span>Телефон или мессенджер</span><input type="text" inputmode="tel" data-lead="contact" value="${h(L.contact ?? S.profile.phone ?? '')}">
      ${inMax ? '<button class="btn ghost small" data-contact-lead>Взять номер из MAX</button>' : ''}</label>
    <label class="field"><span>Коротко о ситуации</span><textarea data-lead="summary" placeholder="Без паспортных данных">${h(L.summary ?? '')}</textarea></label>
    ${d ? `<button class="option multi" role="checkbox" aria-checked="${!!L.withResult}" data-lead-toggle="withResult"><span class="mark"></span><span>Добавить результат теста (без паспорта, ИНН и адреса)</span></button>` : ''}
    <button class="option multi" role="checkbox" aria-checked="${!!L.consent}" data-lead-toggle="consent"><span class="mark"></span><span>Согласен(на) передать имя, контакт и описание ситуации юристам ${PARTNER.name}, чтобы со мной связались</span></button>
    <button class="btn" data-lead-send ${leadReady() ? '' : 'disabled'}>${PARTNER.max ? 'Написать юристу в MAX' : 'Скопировать сообщение и открыть сайт'}</button>
    <p class="muted">Сообщение отправляете вы сами — сервис ничего не передаёт за вас. Данные анкеты и документы в сообщение не попадают.</p>`;
}

function leadText() {
  const L = S.lead ?? {};
  const d = S.diagnosis;
  return [
    'Здравствуйте! Нужна консультация по банкротству гражданина.',
    `Имя: ${L.name ?? S.profile.firstName ?? ''}`,
    `Контакт: ${L.contact ?? S.profile.phone ?? ''}`,
    L.summary ? `Ситуация: ${L.summary}` : '',
    L.withResult && d ? `Результат теста: ${d.path === 'court' ? 'арбитражный суд' : 'МФЦ'}, ${levelText[d.level].toLowerCase()}. ${d.flags.map((f) => f.title).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

// ---------------- Настройки ----------------

function settings() {
  const z = S.zoom ?? 1;
  return `
    <h1>Мои данные и настройки</h1>
    <div class="card">
      <h2>Размер текста</h2>
      <div class="row">${[[1, 'Обычный'], [1.15, 'Крупный'], [1.3, 'Очень крупный']].map(([v, l]) => `<button class="btn ${z === v ? '' : 'secondary'}" data-zoom="${v}">${l}</button>`).join('')}</div>
      <p class="muted">Тёмная тема включается вместе с темой телефона.</p>
    </div>
    <div class="card">
      <h2>Где мои данные</h2>
      <p>Ответы теста, отметки по документам и анкета хранятся только на этом устройстве${inMax ? ' в хранилище MAX (анкета — в защищённом)' : ' в браузере'}. На сервер они не отправляются.</p>
      <button class="btn secondary" data-wipe>Удалить все мои данные</button>
    </div>
    <div class="card">
      <h2>Документы сервиса</h2>
      <button class="btn ghost" data-go="#/legal/terms">Пользовательское соглашение</button>
      <button class="btn ghost" data-go="#/legal/privacy">Политика конфиденциальности</button>
      <button class="btn ghost" data-go="#/legal/consent">Согласие на обработку данных</button>
      <p class="muted">Согласия приняты: ${S.consent ? dateRu(S.consent) : '—'}</p>
      <p class="muted">Оператор и поддержка: ${h(R.legal.operator)}</p>
    </div>
    <p class="muted center">Правила актуальны на ${dateRu(R.checkedAt)} (версия ${h(R.version)}). Нормы и суммы проходят юридическую проверку.</p>`;
}

const applyZoom = () => { document.body.style.zoom = String(S.zoom ?? 1); };

// ---------------- Действия ----------------

async function requestPhone() {
  try {
    const r = await WA.requestContact();
    return r?.phone ? `+${String(r.phone).replace(/^\+/, '')}` : null;
  } catch {
    toast('Номер не получен');
    return null;
  }
}

app.addEventListener('click', async (e) => {
  const el = e.target.closest('button, [data-go]');
  if (!el) return;
  const d = el.dataset;
  if ('back' in d) return back();
  if (d.go) return go(d.go);

  if ('partnerSite' in d) {
    if (inMax) bridge(() => WA.openLink(PARTNER.site));
    else window.open(PARTNER.site, '_blank', 'noopener');
    return;
  }

  // онбординг
  if (d.ob !== undefined) { S.ob = Number(d.ob); return route(); }
  if (d.consent) { S.pending = { ...S.pending, [d.consent]: !S.pending?.[d.consent] }; return route(); }
  if ('start' in d) { S.consent = new Date().toISOString(); delete S.pending; save(); return go('#/'); }

  // тест
  if (d.answer !== undefined) {
    const q = R.questions[S.qi ?? 0];
    if (q.type === 'multi') {
      const cur = Array.isArray(S.answers[q.id]) ? S.answers[q.id] : [];
      const exclusive = ['none', 'nothing'];
      let next = cur.includes(d.answer) ? cur.filter((x) => x !== d.answer) : [...cur, d.answer];
      next = exclusive.includes(d.answer) && !cur.includes(d.answer) ? [d.answer] : next.filter((x) => !exclusive.includes(x) || x === d.answer);
      S.answers[q.id] = next;
    } else S.answers[q.id] = d.answer;
    haptic(); save(); return route();
  }
  if ('next' in d) {
    if ((S.qi ?? 0) >= R.questions.length - 1) {
      S.diagnosis = diagnose(S.answers, R); S.qi = 0; save();
      bridge(() => WA.HapticFeedback.notificationOccurred('success'));
      return location.replace('#/result');
    }
    S.qi = (S.qi ?? 0) + 1; save(); return route();
  }
  if ('prev' in d) { S.qi = Math.max(0, (S.qi ?? 0) - 1); return route(); }
  if ('retest' in d) { S.qi = 0; save(); return go('#/test'); }

  // чек-лист
  if (d.docStatus) {
    const prev = docState(d.docId) ?? {};
    const keepDate = prev.status === 'received' && prev.at;
    S.docs = { ...S.docs, [d.docId]: { ...prev, status: d.docStatus, at: d.docStatus === 'received' ? keepDate || new Date().toISOString() : undefined } };
    haptic(); save(); return route();
  }
  if ('copyList' in d) return copyText(checklistText());
  if ('print' in d) return window.print();

  // этапы и вопросы
  if (d.path) { S.stagesPath = d.path; return route(); }
  if (d.stage) { S.stage = d.stage; S.stagePath = d.stagePath; save(); return route(); }
  if (d.ask) { S.lastQuestion = `${d.ask}: `; S.lastAnswer = null; return go('#/faq'); }
  if ('askQ' in d) {
    const q = document.getElementById('q').value.trim();
    if (!q) return;
    S.lastQuestion = q; S.lastAnswer = answer(q, R); return route();
  }

  // анкета
  if (d.listAdd) {
    const L = STEPS.flatMap((s) => s.lists ?? []).find((x) => x.key === d.listAdd);
    const blank = Object.fromEntries(L.fields.filter((f) => f.select).map((f) => [f.k, f.select[0][0]]));
    S.profile[d.listAdd] = [...(S.profile[d.listAdd] ?? []), blank]; save(); return route();
  }
  if (d.listDel) { S.profile[d.listDel].splice(Number(d.i), 1); save(); return route(); }
  if (d.stepNext) {
    S.stepsSeen = [...new Set([...(S.stepsSeen ?? []), d.stepNext])]; save();
    const steps = stepsFor(path());
    const i = steps.findIndex((s) => s.id === d.stepNext);
    if (stepErrors(d.stepNext, S.profile).length) toast('Шаг сохранён, но остались незаполненные поля');
    return go(i < steps.length - 1 ? `#/step/${steps[i + 1].id}` : '#/papers');
  }
  if (d.proc) { S.profile.procedure = d.proc; save(); return route(); }
  if (d.reason) { const r = S.reasons ?? []; S.reasons = r.includes(d.reason) ? r.filter((x) => x !== d.reason) : [...r, d.reason]; return route(); }
  if ('draft' in d) {
    const text = draftCircumstances(S.reasons ?? [], S.since ?? '');
    if (!text) return toast('Отметьте хотя бы одну причину');
    if (String(S.profile.circumstances ?? '').trim() && !(await ask('Заменить ваш текст черновиком?', 'Заменить'))) return;
    S.profile.circumstances = text; save(); route();
    return document.querySelector('[data-field="circumstances"]')?.scrollIntoView({ block: 'center' });
  }
  if (d.innFill !== undefined) {
    const c = S.profile.creditors[Number(d.innFill)];
    const inn = String(c?.inn ?? '').replace(/\D/g, '');
    if (checkCreditorInn(inn) || !inn) return toast('Сначала введите правильный ИНН');
    try {
      const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${DADATA_TOKEN}` },
        body: JSON.stringify({ query: inn }),
      });
      const org = (await res.json()).suggestions?.[0];
      if (!org) return toast('По этому ИНН ничего не найдено');
      c.name = org.value; c.address = org.data?.address?.value ?? c.address;
      save(); route(true); toast('Заполнено из ЕГРЮЛ — проверьте');
    } catch { toast('Не удалось получить данные, заполните вручную'); }
    return;
  }
  if ('contact' in d) {
    const phone = await requestPhone();
    if (phone) { S.profile.phone = phone; save(); route(); }
    return;
  }

  // документы для подачи
  if (d.pcheck !== undefined) {
    const arr = [...(S.paperChecks?.[d.pid] ?? [])];
    arr[Number(d.pcheck)] = !arr[Number(d.pcheck)];
    S.paperChecks = { ...S.paperChecks, [d.pid]: arr }; return route();
  }
  const tpl = (tid) => { const t = R.templates.find((x) => x.id === tid); return [t, render(t, view())]; };
  if (d.copy) { const [t, b] = tpl(d.copy); return copyText(toPlainText(t, b)); }
  if (d.word) { const [t, b] = tpl(d.word); return downloadWord(t, b); }
  if (d.share) {
    if (!(await ask('В чат уйдут ваши паспортные данные, ИНН и СНИЛС. Отправляйте только себе («Избранное»). Продолжить?', 'Продолжить'))) return;
    const [t, b] = tpl(d.share);
    try { await WA.shareMaxContent({ text: toPlainText(t, b) }); } catch { toast('Не получилось — скопируйте текст'); }
    return;
  }

  // юрист
  if (d.leadToggle) { S.lead = { ...S.lead, [d.leadToggle]: !S.lead?.[d.leadToggle] }; save(); return route(); }
  if ('contactLead' in d) {
    const phone = await requestPhone();
    if (phone) { S.lead = { ...S.lead, contact: phone }; save(); route(); }
    return;
  }
  if ('leadSend' in d) {
    await copyText(leadText());
    if (PARTNER.max && inMax) bridge(() => WA.openMaxLink(PARTNER.max));
    else if (inMax) bridge(() => WA.openLink(PARTNER.site));
    else window.open(PARTNER.site, '_blank', 'noopener');
    return;
  }

  // настройки
  if (d.zoom) { S.zoom = Number(d.zoom); applyZoom(); save(); return route(); }
  if ('wipe' in d) {
    if (!(await ask('Удалить ответы теста, отметки и анкету с этого устройства?', 'Удалить'))) return;
    await wipe(); S = { answers: {}, profile: {} }; applyZoom(); return go('#/welcome');
  }
});

// Ввод без перерисовки, чтобы не сбивать фокус
app.addEventListener('input', (e) => {
  const el = e.target;
  const d = el.dataset;
  if (el.id === 'num') {
    const n = Number(el.value.replace(/\D/g, ''));
    S.answers.debtTotal = el.value.trim() ? n : undefined;
    document.getElementById('numHint').textContent = el.value.trim() ? `${rub(n)} ₽` : '';
    document.querySelector('[data-next]').disabled = !el.value.trim();
    return save();
  }
  const showErr = () => {
    const box = el.closest('label')?.querySelector('[data-err]');
    if (box && d.check) box.textContent = el.value ? CHECKS[d.check](el.value) ?? '' : '';
  };
  if (d.field) {
    S.profile[d.field] = d.field === 'depositPaid' ? el.value === 'yes' : el.value;
    showErr();
    if (d.field === 'regAddress') {
      const c = courtByAddress(el.value, R);
      if (c) S.profile.courtId = c.id;
    }
    if (d.field === 'courtId') {
      const box = document.getElementById('court');
      const c = R.courts.find((x) => x.id === el.value);
      if (box) box.innerHTML = c ? `<span class="title">${h(c.court)}</span><span class="muted">Выбран вручную</span>` : '<span class="muted">Выберите регион.</span>';
    }
  } else if (d.list) {
    S.profile[d.list][Number(d.i)][d.k] = el.value;
    showErr();
    if (d.k === 'kind') { save(); return route(true); } // набор полей зависит от вида имущества
  } else if ('since' in d) {
    S.since = el.value;
  } else if (d.lead) {
    S.lead = { ...S.lead, [d.lead]: el.value };
    const btn = app.querySelector('[data-lead-send]');
    if (btn) btn.disabled = !leadReady();
  } else if (d.docNote) {
    S.docs = { ...S.docs, [d.docNote]: { ...(docState(d.docNote) ?? { status: 'none' }), note: el.value } };
  } else return;
  if (location.hash.startsWith('#/step/')) updateStepErrors(location.hash.split('/')[2]);
  save();
});
app.addEventListener('change', (e) => {
  if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true }));
});
app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'q') app.querySelector('[data-ask-q]')?.click(); });

// ---------------- Запуск ----------------

/** Ждём MAX Bridge не дольше timeout мс: медленный сервер MAX не должен вешать приложение. */
function waitForBridge(timeout = 3000) {
  return new Promise((resolve) => {
    if (window.WebApp) return resolve();
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(resolve, timeout);
    const tag = document.getElementById('max-bridge');
    tag?.addEventListener('load', done);
    tag?.addEventListener('error', done);
  });
}

(async () => {
  try {
    const rulesP = loadRules();
    await waitForBridge();
    WA = window.WebApp ?? null;
    inMax = !!WA && !!WA.platform && WA.platform !== 'web';
    [R, S] = await Promise.all([rulesP, loadState()]);
  } catch (err) {
    app.innerHTML = `<h1>Не удалось загрузить</h1><p>Проверьте интернет и откройте приложение снова.</p><p class="muted">${h(err.message)}</p>`;
    return;
  }
  S.answers ??= {};
  S.profile ??= {};
  applyZoom();
  bridge(() => WA.BackButton.onClick(back));
  window.addEventListener('hashchange', () => route());
  route();
})();
