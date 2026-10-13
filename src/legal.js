import { initI18n, getLang, onLangChange, t } from './i18n/index.js';

/*
  Páginas /privacy y /terms. Usan el mismo selector EN|ES y la misma preferencia guardada que la página
  principal. Cada página trae el texto completo en los dos idiomas (<article data-legal-lang>); aquí se
  muestra solo el del idioma activo. Sin JS se ven los dos.
  Anclas: la versión en inglés usa id="x" y la española id="es-x"; si llega /privacy/#location con el
  español activo, se lleva al visitante a #es-location (y al revés).
*/
document.documentElement.classList.add('js');

const docs = document.querySelectorAll('[data-legal-lang]');
const titleKey = document.body.dataset.titleKey;

function syncAnchor(lang, scroll) {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const base = id.replace(/^es-/, '');
  const target = document.getElementById(lang === 'es' ? `es-${base}` : base);
  if (!target) return;
  if (target.id !== id) history.replaceState(null, '', `#${target.id}`);
  if (scroll) target.scrollIntoView();
}

function show(lang) {
  docs.forEach((doc) => {
    doc.hidden = doc.dataset.legalLang !== lang;
  });
  if (titleKey) document.title = `${t(titleKey)} · AR Airport Rides`;
}

initI18n();
show(getLang());
syncAnchor(getLang(), true);
onLangChange((lang) => {
  show(lang);
  syncAnchor(lang, false);
});

document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
