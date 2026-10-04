// Шаги анкеты. Форма строится по этому описанию.
// check — имя проверки из logic.js; mode — тип клавиатуры на телефоне.

const yesNo = [['no', 'нет'], ['yes', 'да']];

export const STEPS = [
  {
    id: 'me',
    title: 'О вас',
    hint: 'Паспорт, ИНН, СНИЛС, адрес',
    fields: [
      { k: 'lastName', l: 'Фамилия' },
      { k: 'firstName', l: 'Имя' },
      { k: 'middleName', l: 'Отчество (если есть)' },
      { k: 'birthDate', l: 'Дата рождения', ph: 'ДД.ММ.ГГГГ', mode: 'numeric', check: 'dateReq' },
      { k: 'birthPlace', l: 'Место рождения', hint: 'Как в паспорте' },
      { row: [{ k: 'passportSeries', l: 'Серия паспорта', mode: 'numeric', check: 'series' }, { k: 'passportNumber', l: 'Номер', mode: 'numeric', check: 'passNum' }] },
      { k: 'passportIssuedBy', l: 'Кем выдан паспорт' },
      { k: 'passportIssuedAt', l: 'Дата выдачи', ph: 'ДД.ММ.ГГГГ', mode: 'numeric', check: 'dateReq' },
      { k: 'inn', l: 'ИНН', mode: 'numeric', check: 'inn', hint: '12 цифр. Узнать: nalog.gov.ru → «Узнать ИНН»' },
      { k: 'snils', l: 'СНИЛС', mode: 'numeric', check: 'snils', ph: '123-456-789 01' },
      { k: 'regAddress', l: 'Адрес регистрации', hint: 'По нему определяется суд' },
      { k: 'liveAddress', l: 'Где фактически живёте (если отличается)' },
      { k: 'phone', l: 'Телефон', mode: 'tel', contact: true },
      { k: 'email', l: 'E-mail', mode: 'email' },
    ],
  },
  {
    id: 'family',
    title: 'Семья и доходы',
    hint: 'Брак, дети, работа, доходы за 3 года',
    court: true,
    fields: [
      { k: 'maritalStatus', l: 'Семейное положение', select: [['', 'Выберите…'], ['single', 'не в браке'], ['married', 'в браке'], ['divorced', 'разведён(а)'], ['widowed', 'вдова / вдовец']] },
      { k: 'spouseName', l: 'ФИО супруга или бывшего супруга (если есть)' },
      { k: 'employment', l: 'Где работаете сейчас', ph: 'ООО «Пример», кладовщик — или «не работаю»' },
    ],
    lists: [
      { key: 'dependents', item: 'Иждивенец', title: 'Дети и иждивенцы', add: 'Добавить иждивенца', fields: [{ k: 'name', l: 'ФИО' }, { k: 'birthDate', l: 'Дата рождения', ph: 'ДД.ММ.ГГГГ', check: 'date' }, { k: 'relation', l: 'Кем приходится', ph: 'сын, дочь, мать…' }] },
      { key: 'incomes', item: 'Доход', title: 'Доходы за 3 года', add: 'Добавить доход', note: 'Суммы — из справок о доходах (личный кабинет налогоплательщика).', fields: [{ k: 'year', l: 'Год', mode: 'numeric' }, { k: 'source', l: 'Источник', ph: 'зарплата, пенсия, пособие…' }, { k: 'amount', l: 'Сумма за год, ₽', mode: 'decimal', check: 'amount' }] },
    ],
  },
  {
    id: 'property',
    title: 'Имущество и счета',
    hint: 'Всё, что есть, включая нулевые счета',
    court: true,
    note: 'Указывайте всё честно: скрытое имущество — основание отказать в списании долгов (п. 4 ст. 213.28 127-ФЗ). Если ничего нет — просто нажмите «Дальше».',
    lists: [
      { key: 'property', item: 'Объект', title: 'Имущество', add: 'Добавить имущество', fields: [{ k: 'kind', l: 'Вид', select: [['realty', 'Недвижимость'], ['car', 'Транспорт'], ['land', 'Земля'], ['share', 'Доля, акции'], ['other', 'Другое']] }, { k: 'description', l: 'Описание, адрес, VIN или кадастровый номер' }, { k: 'value', l: 'Примерная стоимость, ₽', mode: 'decimal', check: 'amount' }, { k: 'pledge', l: 'В залоге (ипотека, автокредит)', select: yesNo }] },
      { key: 'accounts', item: 'Счёт', title: 'Счета и карты', add: 'Добавить счёт', note: 'Все счета из справки ФНС, включая нулевые.', fields: [{ k: 'bank', l: 'Банк' }, { k: 'number', l: 'Номер счёта', mode: 'numeric' }, { k: 'balance', l: 'Остаток, ₽', mode: 'decimal', check: 'amount' }] },
    ],
  },
  {
    id: 'deals',
    title: 'Сделки за 3 года',
    hint: 'Продажи, дарения, крупные переводы',
    court: true,
    note: 'Сделки с недвижимостью, транспортом, долями и любые сделки дороже порога из базы правил. Если не было — нажмите «Дальше».',
    lists: [
      { key: 'deals', item: 'Сделка', title: 'Сделки', add: 'Добавить сделку', fields: [{ k: 'description', l: 'Что за сделка', ph: 'Продажа автомобиля Lada Granta' }, { k: 'date', l: 'Дата', ph: 'ДД.ММ.ГГГГ', check: 'date' }, { k: 'amount', l: 'Сумма, ₽', mode: 'decimal', check: 'amount' }, { k: 'counterparty', l: 'Кто вторая сторона' }] },
    ],
  },
  {
    id: 'creditors',
    title: 'Кредиторы',
    hint: 'Кому и сколько вы должны',
    note: 'Сверьтесь с кредитной историей: долг, которого нет в заявлении, могут не списать.',
    lists: [
      {
        key: 'creditors', item: 'Кредитор', title: 'Кредиторы', add: 'Добавить кредитора', min: 1,
        fields: [
          { k: 'type', l: 'Тип долга', select: [['bank', 'Банк'], ['mfo', 'МФО'], ['zhkh', 'ЖКХ'], ['tax', 'Налоги'], ['private', 'Частное лицо'], ['other', 'Другое']] },
          { k: 'name', l: 'Название или ФИО', ph: 'ПАО «Банк»' },
          { k: 'inn', l: 'ИНН кредитора (если знаете)', mode: 'numeric', check: 'creditorInn' },
          { k: 'basis', l: 'Основание', ph: 'Кредитный договор № 123' },
          { k: 'date', l: 'Дата договора', ph: 'ДД.ММ.ГГГГ', check: 'date' },
          { k: 'principal', l: 'Основной долг, ₽', mode: 'decimal', check: 'amount' },
          { k: 'interest', l: 'Проценты, ₽', mode: 'decimal', check: 'amount' },
          { k: 'penalties', l: 'Штрафы и пени, ₽', mode: 'decimal', check: 'amount' },
          { k: 'proofDoc', l: 'Подтверждающий документ', ph: 'Справка о задолженности от 01.09.2026' },
        ],
      },
    ],
  },
  {
    id: 'court',
    title: 'Суд и заявление',
    hint: 'Подсудность, СРО, обстоятельства',
    court: true,
    custom: 'court',
  },
];

export const stepsFor = (path) => STEPS.filter((s) => path === 'court' || !s.court);
