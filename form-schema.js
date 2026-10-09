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
      { k: 'prevNames', l: 'Прежние фамилия, имя, отчество (если меняли)', hint: 'Например, девичья фамилия. Нужно для списка кредиторов и описи' },
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
    fields: [{ k: 'cash', l: 'Наличные деньги, ₽ (если есть)', mode: 'decimal', check: 'amount' }],
    lists: [
      {
        key: 'property', item: 'Объект', title: 'Имущество', add: 'Добавить имущество',
        // when — для каких видов имущества показывать поле (разделы описи по приказу № 530)
        fields: [
          { k: 'kind', l: 'Вид', select: [['realty', 'Квартира, дом, другая недвижимость'], ['land', 'Земельный участок'], ['car', 'Транспорт'], ['share', 'Доля в организации'], ['securities', 'Акции, облигации'], ['valuables', 'Ценности (украшения, техника и т.п.)'], ['other', 'Другое']] },
          { k: 'description', l: 'Что это', ph: 'Квартира 2-комн. / Lada Granta, 2012 / ООО «Ромашка»' },
          { k: 'ownership', l: 'Вид собственности', when: ['realty', 'land', 'car'], select: [['individual', 'индивидуальная'], ['joint', 'общая совместная (с супругом)'], ['shared', 'общая долевая']] },
          { k: 'address', l: 'Адрес (местонахождение / где хранится)', when: ['realty', 'land', 'car', 'share', 'valuables', 'other'] },
          { k: 'area', l: 'Площадь, кв. м', mode: 'decimal', when: ['realty', 'land'] },
          { k: 'vin', l: 'VIN (идентификационный номер)', when: ['car'] },
          { k: 'basis', l: 'Основание приобретения / участия', ph: 'Договор купли-продажи от 01.02.2015', when: ['realty', 'land', 'car', 'share'] },
          { k: 'capital', l: 'Уставный капитал, ₽', mode: 'decimal', check: 'amount', when: ['share'] },
          { k: 'shareSize', l: 'Доля участия', ph: '50%', when: ['share'] },
          { k: 'issuer', l: 'Кто выпустил ценную бумагу', when: ['securities'] },
          { k: 'nominal', l: 'Номинал одной бумаги, ₽', mode: 'decimal', check: 'amount', when: ['securities'] },
          { k: 'qty', l: 'Количество', mode: 'numeric', when: ['securities'] },
          { k: 'value', l: 'Стоимость, ₽', mode: 'decimal', check: 'amount' },
          { k: 'pledge', l: 'В залоге (ипотека, автокредит)', select: yesNo, when: ['realty', 'land', 'car', 'valuables', 'other'] },
          { k: 'pledgee', l: 'Кто залогодержатель', ph: 'ПАО «Банк»', when: ['realty', 'land', 'car', 'valuables', 'other'] },
        ],
      },
      { key: 'accounts', item: 'Счёт', title: 'Счета и карты', add: 'Добавить счёт', note: 'Все счета из справки ФНС, включая нулевые.', fields: [{ k: 'bank', l: 'Банк (название и адрес)' }, { k: 'accountType', l: 'Вид и валюта счёта', ph: 'текущий, рубль' }, { k: 'opened', l: 'Дата открытия', ph: 'ДД.ММ.ГГГГ', check: 'date' }, { k: 'number', l: 'Номер счёта', mode: 'numeric' }, { k: 'balance', l: 'Остаток, ₽', mode: 'decimal', check: 'amount' }] },
      { key: 'receivables', item: 'Должник', title: 'Кто должен вам', add: 'Добавить должника', note: 'Если кто-то должен вам деньги (по расписке, решению суда), укажите — это попадёт в список кредиторов и должников.', fields: [{ k: 'name', l: 'ФИО или название' }, { k: 'address', l: 'Адрес' }, { k: 'basis', l: 'Основание', ph: 'Расписка от 01.02.2023' }, { k: 'amount', l: 'Сумма, ₽', mode: 'decimal', check: 'amount' }] },
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
          { k: 'name', l: 'Название или ФИО (для налога — название налога)', ph: 'ПАО «Банк» / Транспортный налог' },
          { k: 'inn', l: 'ИНН кредитора (если знаете)', mode: 'numeric', check: 'creditorInn', innFill: true },
          { k: 'address', l: 'Адрес кредитора', ph: 'г. Москва, ул. Вавилова, д. 19', hint: 'Есть в договоре или на сайте кредитора' },
          { k: 'basis', l: 'Основание', ph: 'Кредитный договор № 123' },
          { k: 'date', l: 'Дата договора', ph: 'ДД.ММ.ГГГГ', check: 'date' },
          { k: 'principal', l: 'Основной долг, ₽', mode: 'decimal', check: 'amount' },
          { k: 'interest', l: 'Проценты, ₽', mode: 'decimal', check: 'amount' },
          { k: 'penalties', l: 'Штрафы и пени, ₽', mode: 'decimal', check: 'amount' },
          { k: 'proofDoc', l: 'Подтверждающий документ', ph: 'Справка о задолженности от 01.09.2026' },
          { k: 'business', l: 'Долг связан с предпринимательством (ИП)?', select: yesNo },
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
