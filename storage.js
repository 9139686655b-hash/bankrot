// Хранение на устройстве пользователя.
// В приложении MAX: анкета (паспорт, ИНН, СНИЛС) — в SecureStorage (зашифровано),
// остальное — в DeviceStorage. В браузере (для проверки) — localStorage.
// На наш сервер ничего не отправляется: сервера у мини-приложения нет.

const WA = () => window.WebApp;
const inMax = () => !!WA() && WA().platform && WA().platform !== 'web' && !!WA().DeviceStorage;

async function get(store, key) {
  try {
    if (inMax()) {
      const v = await WA()[store].getItem(key);
      return typeof v === 'string' ? v : v?.value ?? null; // формат ответа может отличаться между версиями клиента
    }
  } catch {
    /* хранилище недоступно — пробуем localStorage */
  }
  return localStorage.getItem(`${store}:${key}`);
}

async function set(store, key, value) {
  try {
    if (inMax()) return await WA()[store].setItem(key, value);
  } catch {
    if (store === 'SecureStorage') return set('DeviceStorage', key, value); // например, превышен размер
  }
  localStorage.setItem(`${store}:${key}`, value);
}

async function del(store, key) {
  try {
    if (inMax()) await WA()[store].removeItem(key);
  } catch {
    /* ignore */
  }
  localStorage.removeItem(`${store}:${key}`);
}

const parse = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

export async function loadState() {
  const [state, profile, profileFallback] = await Promise.all([
    get('DeviceStorage', 'state'),
    get('SecureStorage', 'profile'),
    get('DeviceStorage', 'profile'),
  ]);
  return { ...parse(state, {}), profile: parse(profile ?? profileFallback, {}) };
}

let timer = null;
/** Сохранение с задержкой, чтобы не писать на каждое нажатие клавиши. */
export function saveState(s) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const { profile, ...rest } = s;
    set('DeviceStorage', 'state', JSON.stringify(rest));
    set('SecureStorage', 'profile', JSON.stringify(profile ?? {}));
  }, 300);
}

export async function wipe() {
  clearTimeout(timer);
  await Promise.all([del('DeviceStorage', 'state'), del('SecureStorage', 'profile'), del('DeviceStorage', 'profile')]);
}
