import en from './en.json';
import es from './es.json';

const DICTS = { en, es };
const STORAGE_KEY = 'ar-lang';
const listeners = new Set();
let current = 'en';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v in DICTS ? v : null;
  } catch {
    return null;
  }
}

function store(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* almacenamiento bloqueado: la elección vale solo para esta visita */
  }
}

function detect() {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return langs.some((l) => l?.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

export const t = (key) => DICTS[current][key] ?? DICTS.en[key];
export const getLang = () => current;
export const onLangChange = (fn) => listeners.add(fn);

function apply(lang) {
  current = lang;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  // data-i18n-attr="aria-label:lang.label"
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const [attr, key] = el.dataset.i18nAttr.split(':');
    el.setAttribute(attr, t(key));
  });
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });

  listeners.forEach((fn) => fn(lang));
}

export function initI18n() {
  apply(readStored() ?? detect());

  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang === current) return;
      store(lang);
      apply(lang);
    });
  });
}
