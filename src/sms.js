import { CONFIG } from './config.js';
import { t, onLangChange } from './i18n/index.js';
import { detectPlatform, smsHref } from './lib/sms.js';

/*
  Botones "Text us" ([data-sms]). En táctil: enlace sms: con el mensaje prellenado en el idioma activo
  (formato según iOS / Android, ver src/lib/sms.js). En escritorio: el teléfono como enlace tel:
  (el CSS muestra el número en vez de la etiqueta). Sin JS: el HTML ya trae href="sms:<número>".
*/
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';
const custom = new WeakMap(); // enlace → función que arma su mensaje (p. ej. el resultado del formulario)

const platform = () => detectPlatform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
const isTouch = () => {
  try {
    return window.matchMedia(TOUCH_QUERY).matches;
  } catch {
    return false;
  }
};

function render(link) {
  if (!isTouch()) {
    link.href = `tel:${CONFIG.phoneTel}`;
    return;
  }
  const body = custom.get(link)?.() ?? t('sms.message');
  link.href = smsHref(CONFIG.smsNumber, body, platform());
}

const renderAll = () => document.querySelectorAll('[data-sms]').forEach(render);

/** Asigna a un enlace [data-sms] un mensaje propio (se vuelve a armar al cambiar de idioma). */
export function setSmsMessage(link, buildMessage) {
  custom.set(link, buildMessage);
  render(link);
}

export function initSms() {
  renderAll();
  onLangChange(renderAll);
  try {
    window.matchMedia(TOUCH_QUERY).addEventListener('change', renderAll);
  } catch {
    /* navegadores sin matchMedia.addEventListener */
  }
}
