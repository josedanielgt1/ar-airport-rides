import { CONFIG } from './config.js';
import { t, onLangChange } from './i18n/index.js';

export const whatsappUrl = (message) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;

export function initWhatsApp() {
  const links = document.querySelectorAll('[data-wa]');
  const update = () => {
    const href = whatsappUrl(t('wa.message'));
    links.forEach((a) => (a.href = href));
  };
  update();
  onLangChange(update);

  const fab = document.querySelector('.wa-fab');
  if (!fab) return;
  if (!('IntersectionObserver' in window)) {
    fab.classList.add('is-on');
    return;
  }

  // El fijo aparece solo cuando el botón del hero sale de pantalla, y se aparta mientras haya
  // en pantalla una zona marcada con data-fab-avoid (p. ej. el botón de enviar del formulario).
  const heroCta = document.querySelector('.hero__cta');
  if (heroCta) {
    new IntersectionObserver(([e]) => fab.classList.toggle('is-on', !e.isIntersecting)).observe(heroCta);
  } else {
    fab.classList.add('is-on');
  }

  const avoid = document.querySelectorAll('[data-fab-avoid]');
  if (!avoid.length) return;
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    fab.classList.toggle('is-away', visible.size > 0);
  });
  avoid.forEach((el) => io.observe(el));
}
