import { CONFIG } from './config.js';
import { t, onLangChange } from './i18n/index.js';

export const whatsappUrl = (message) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;

export function initWhatsApp() {
  const fab = document.querySelector('.wa-fab');
  if (!fab) return;

  const update = () => {
    fab.href = whatsappUrl(t('wa.message'));
  };
  update();
  onLangChange(update);

  // Se aparta cuando hay en pantalla una zona marcada con data-fab-avoid
  // (p. ej. el botón de enviar del formulario), para no taparla.
  const avoid = document.querySelectorAll('[data-fab-avoid]');
  if (!avoid.length || !('IntersectionObserver' in window)) return;
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    fab.classList.toggle('is-away', visible.size > 0);
  });
  avoid.forEach((el) => io.observe(el));
}
