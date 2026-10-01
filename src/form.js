import services from './data/services.json';
import { validateReservation, FIELDS } from './lib/validate.js';
import { t, getLang, onLangChange } from './i18n/index.js';
import { whatsappUrl } from './whatsapp.js';
import { serviceName } from './content.js';
import { getRef } from './ref.js';

/*
  Formulario de reserva con JS:
  1. Valida con el mismo módulo que el servidor; muestra el error junto a cada campo y enfoca el primero.
  2. Prepara el enlace de WhatsApp con los datos ANTES de esperar al servidor (no se usa window.open
     después de un await: el visitante toca un enlace normal).
  3. POST a /api/reserve. Éxito → "Continue on WhatsApp". Fallo del correo → el mismo botón y un aviso.
  Sin JS el formulario se envía normal y el servidor redirige a #reserve-sent / #reserve-error.
*/

const ENDPOINT = '/api/reserve';
const SERVICE_IDS = services.items.map((s) => s.id);
const pad = (n) => String(n).padStart(2, '0');
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function initForm() {
  const form = document.getElementById('reserve-form');
  if (!form) return;

  form.noValidate = true; // la validación la hace este módulo, con mensajes propios en EN/ES
  const submit = form.querySelector('.form__submit');
  const status = form.querySelector('.form__status');
  const result = form.querySelector('.form__result');
  const resultTitle = result.querySelector('.form__result-title');
  const resultText = result.querySelector('.form__result-text');
  const waBtn = result.querySelector('.form__wa');
  const dateInput = form.elements.namedItem('date');
  dateInput.min = localToday();

  let errors = {};
  let outcome = null; // 'success' | 'simulated' | 'error'
  let lastData = null;
  let busy = false;

  const fieldInput = (name) => form.elements.namedItem(name);
  const errorEl = (name) => document.getElementById(`f-${name}-error`);

  const renderErrors = () => {
    for (const name of FIELDS) {
      const input = fieldInput(name);
      const el = errorEl(name);
      if (!input || !el) continue;
      if (errors[name]) {
        el.textContent = t(`form.error.${errors[name]}`);
        el.hidden = false;
        input.setAttribute('aria-invalid', 'true');
      } else {
        el.textContent = '';
        el.hidden = true;
        input.removeAttribute('aria-invalid');
      }
    }
  };

  const setStatus = (key, isError = false) => {
    status.textContent = key ? t(key) : '';
    status.classList.toggle('is-error', isError);
  };

  const focusFirstError = () => {
    const first = FIELDS.find((name) => errors[name]);
    fieldInput(first)?.focus();
  };

  // Mensaje de WhatsApp en el idioma activo, con los datos de la solicitud.
  const waMessage = (data) => {
    const lang = getLang();
    const lines = [
      t('wa.formIntro'),
      '',
      `${t('form.name')}: ${data.name}`,
      `${t('form.phone')}: ${data.phone}`,
      `${t('form.service')}: ${serviceName(data.service, lang)}`,
      `${t('form.date')}: ${data.date}`,
      `${t('form.time')}: ${data.time}`,
      `${t('form.origin')}: ${data.origin}`,
      `${t('form.destination')}: ${data.destination}`,
      `${t('form.passengers')}: ${data.passengers}`,
    ];
    if (data.notes) lines.push(`${t('wa.notes')}: ${data.notes}`);
    return lines.join('\n');
  };

  const renderResult = () => {
    if (!outcome) {
      result.hidden = true;
      return;
    }
    const ok = outcome !== 'error';
    resultTitle.textContent = t(ok ? 'form.successTitle' : 'form.errorTitle');
    resultText.textContent = t(ok ? 'form.successText' : 'form.errorText');
    if (outcome === 'simulated') resultText.textContent += ` ${t('form.simulated')}`;
    if (lastData) waBtn.href = whatsappUrl(waMessage(lastData));
    result.hidden = false;
  };

  // Al corregir un campo marcado, se revalida y el error desaparece en cuanto es válido.
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (!errors[name]) return;
    const check = validateReservation(Object.fromEntries(new FormData(form)), {
      serviceIds: SERVICE_IDS,
      today: localToday(),
    });
    if (!check.errors[name]) {
      delete errors[name];
      renderErrors();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;

    const raw = Object.fromEntries(new FormData(form));
    raw.lang = getLang();
    raw.ref = getRef();
    const check = validateReservation(raw, { serviceIds: SERVICE_IDS, today: localToday() });
    errors = check.errors;
    renderErrors();
    if (!check.ok) {
      setStatus('form.checkFields', true);
      focusFirstError();
      return;
    }

    // Enlace listo antes de esperar al servidor: sirve aunque falle el correo.
    lastData = check.data;
    waBtn.href = whatsappUrl(waMessage(lastData));
    outcome = null;
    renderResult();

    busy = true;
    submit.setAttribute('aria-busy', 'true');
    setStatus('form.sending');

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(raw),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        outcome = body.simulated ? 'simulated' : 'success';
      } else if (res.status === 422 && body.errors) {
        errors = body.errors;
        renderErrors();
        setStatus('form.checkFields', true);
        focusFirstError();
        return;
      } else {
        outcome = 'error';
      }
    } catch {
      outcome = 'error';
    } finally {
      busy = false;
      submit.removeAttribute('aria-busy');
    }

    setStatus(outcome === 'error' ? 'form.errorTitle' : 'form.successTitle', outcome === 'error');
    renderResult();
    if (outcome !== 'error') form.reset();
    dateInput.min = localToday();
    result.focus();
  });

  form.querySelector('input[name="lang"]').value = getLang();
  onLangChange((lang) => {
    form.querySelector('input[name="lang"]').value = lang;
    renderErrors();
    if (status.textContent) {
      // Re-traduce el estado visible sin volver a anunciar nada nuevo.
      const key = outcome === 'error' ? 'form.errorTitle' : outcome ? 'form.successTitle' : Object.keys(errors).length ? 'form.checkFields' : '';
      setStatus(key, outcome === 'error' || (!outcome && Object.keys(errors).length > 0));
    }
    renderResult();
  });
}
