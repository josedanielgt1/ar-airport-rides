/*
  Validación y saneado de la solicitud de reserva. Lo usan el navegador (src/form.js), la función
  serverless (api/reserve.js) y la simulación local (vite.config.js). Sin dependencias.
  Los errores son códigos; cada uno tiene su texto en src/i18n (form.error.<código>).
*/

export const LIMITS = {
  name: 80,
  phone: 25,
  place: 160,
  notes: 1000,
  // TODO(cliente): confirmar la capacidad máxima de pasajeros (provisional: 7).
  passengersMin: 1,
  passengersMax: 7,
};

export const FIELDS = ['name', 'phone', 'service', 'date', 'time', 'origin', 'destination', 'passengers', 'notes'];

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// Quita caracteres de control (excepto salto de línea y tabulador) y espacios de los extremos.
// eslint-disable-next-line no-control-regex
const clean = (v) => str(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const oneLine = (v) => clean(v).replace(/\s+/g, ' ');

/** Fecha de hoy (AAAA-MM-DD) en una zona horaria. */
export function todayIn(timeZone = 'America/Chicago', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Resta días a una fecha AAAA-MM-DD (para dar margen entre zonas horarias). */
export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isRealDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * @param {Record<string, unknown>} input  campos tal como llegan (FormData → objeto o JSON)
 * @param {{ serviceIds?: string[], today?: string }} [opts]
 *   serviceIds: ids válidos de src/data/services.json; today: fecha mínima permitida (AAAA-MM-DD)
 * @returns {{ ok: boolean, errors: Record<string, string>, data: Record<string, string|number> }}
 */
export function validateReservation(input, { serviceIds, today } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};
  const data = {};

  const text = (field, max, { required = true, multiline = false } = {}) => {
    const v = multiline ? clean(src[field]) : oneLine(src[field]);
    if (!v) {
      if (required) errors[field] = 'required';
    } else if (v.length > max) {
      errors[field] = 'tooLong';
    }
    data[field] = v;
  };

  text('name', LIMITS.name);
  if (!errors.name && data.name.length < 2) errors.name = 'invalid';

  text('phone', LIMITS.phone);
  if (!errors.phone) {
    const digits = data.phone.replace(/\D/g, '');
    if (!/^[+()\d\s.-]+$/.test(data.phone) || digits.length < 7 || digits.length > 15) errors.phone = 'phone';
  }

  data.service = oneLine(src.service);
  if (!data.service) errors.service = 'service';
  else if (!/^[a-z0-9-]{1,40}$/.test(data.service) || (serviceIds && !serviceIds.includes(data.service))) {
    errors.service = 'service';
  }

  data.date = oneLine(src.date);
  if (!data.date) errors.date = 'required';
  else if (!isRealDate(data.date) || (today && data.date < today)) errors.date = 'date';

  data.time = oneLine(src.time).slice(0, 5);
  if (!data.time) errors.time = 'required';
  else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) errors.time = 'time';

  text('origin', LIMITS.place);
  text('destination', LIMITS.place);

  const pax = oneLine(src.passengers);
  const n = Number(pax);
  if (!pax) errors.passengers = 'required';
  else if (!/^\d{1,2}$/.test(pax) || n < LIMITS.passengersMin || n > LIMITS.passengersMax) errors.passengers = 'passengers';
  data.passengers = Number.isFinite(n) ? n : 0;

  text('notes', LIMITS.notes, { required: false, multiline: true });

  // Metadatos: valores cerrados, nunca texto libre.
  data.lang = src.lang === 'es' ? 'es' : 'en';
  data.ref = src.ref === 'card' ? 'card' : 'direct';

  return { ok: Object.keys(errors).length === 0, errors, data };
}

/** Honeypot: el campo "company" está oculto para personas; si trae texto, es un bot. */
export const isSpam = (input) => oneLine(input?.company).length > 0;

/** Escapa texto para insertarlo en HTML. */
export const escapeHtml = (s) =>
  str(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
