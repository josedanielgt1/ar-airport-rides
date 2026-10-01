import { CONFIG } from './config.js';
import { t, onLangChange } from './i18n/index.js';

export const whatsappUrl = (message) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;

export function initWhatsApp() {
  const root = document.documentElement;
  const links = document.querySelectorAll('[data-wa]');
  const update = () => {
    const href = whatsappUrl(t('wa.message'));
    links.forEach((a) => (a.href = href));
  };
  update();
  onLangChange(update);

  if (!('IntersectionObserver' in window)) {
    root.classList.add('is-past-hero');
    return;
  }

  // Al salir el botón del hero de pantalla: header con botón (escritorio) o barra inferior (móvil).
  const heroCta = document.querySelector('.hero__cta');
  if (heroCta) {
    new IntersectionObserver(([e]) =>
      root.classList.toggle('is-past-hero', !e.isIntersecting && e.boundingClientRect.top < 0),
    ).observe(heroCta);
  } else {
    root.classList.add('is-past-hero');
  }

  // La barra inferior se aparta mientras haya en pantalla una zona marcada con data-fab-avoid
  // (el botón de enviar del formulario), para no taparla.
  const bar = document.querySelector('.wa-bar');
  const avoid = document.querySelectorAll('[data-fab-avoid]');
  if (!bar || !avoid.length) return;
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    bar.classList.toggle('is-away', visible.size > 0);
  });
  avoid.forEach((el) => io.observe(el));
}
