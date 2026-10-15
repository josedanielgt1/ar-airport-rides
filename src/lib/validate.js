/*
  Validación y saneado de la solicitud de reserva. Lo usan el navegador (src/form.js), la función
  serverless (api/reserve.js) y la simulación local (vite.config.js). Sin dependencias.
  Los errores son códigos; cada uno tiene su texto en src/i18n (form.error.<código>).
*/

export const LIMITS = {
  name: 80,
  phone: 25,
  email: 120,
  place: 160,
  notes: 1000,
  // TODO(cliente): confirmar la capacidad máxima de pasajeros (provisional: 7).
  passengersMin: 1,
  passengersMax: 7,
};

export const FIELDS = ['name', 'phone', 'email', 'service', 'date', 'time', 'origin', 'destination', 'passengers', 'notes', 'consent'];

// Un solo destinatario y nada que pueda romper una cabecera: sin espacios, comillas, comas, punto y coma,
// ángulos ni saltos de línea. Parte local sin puntos al inicio/fin ni dobles; etiquetas del dominio sin
// guion al inicio/fin; dominio de nivel superior solo letras.
const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]{1,64}(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

/**
 * Dominios de correo desechable comunes (lista corta a propósito: solo los más usados por bots; un
 * pasajero real que use uno ve "correo no válido" y puede escribir otro o reservar por WhatsApp/SMS).
 * Para ajustar la lista, edítala aquí o pasa `blockedEmailDomains` a validateReservation. Se bloquean
 * también sus subdominios.
 */
export const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  '10minutemail.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'throwawaymail.com',
  'fakeinbox.com',
  'mintemail.com',
  'emailondeck.com',
  'moakt.com',
  'mailnesia.com',
  'mohmal.com',
];

/** true si el dominio del correo (o un dominio padre) está en la lista. */
export function isBlockedEmailDomain(email, list = DISPOSABLE_EMAIL_DOMAINS) {
  const domain = str(email).split('@').pop().toLowerCase();
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// Quita caracteres de control (excepto salto de línea y tabulador), caracteres invisibles de ancho cero y
// de control bidireccional (sirven para disfrazar texto, SEC-11) y espacios de los extremos.
const clean = (v) =>
  str(v)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '')
    .trim();
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
 * @param {{ serviceIds?: string[], today?: string, blockedEmailDomains?: string[] }} [opts]
 *   serviceIds: ids válidos de src/data/services.json; today: fecha mínima permitida (AAAA-MM-DD);
 *   blockedEmailDomains: dominios de correo rechazados (por defecto DISPOSABLE_EMAIL_DOMAINS)
 * @returns {{ ok: boolean, errors: Record<string, string>, data: Record<string, string|number> }}
 */
export function validateReservation(input, { serviceIds, today, blockedEmailDomains = DISPOSABLE_EMAIL_DOMAINS } = {}) {
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

  // Correo del pasajero: opcional. Con él, el chofer puede responderle por correo; sin él, por SMS.
  // Formato prudente (sin espacios, comillas, comas ni símbolos de cabecera); el valor nunca lleva saltos de línea.
  text('email', LIMITS.email);
  if (!errors.email && data.email && (!EMAIL_RE.test(data.email) || isBlockedEmailDomain(data.email, blockedEmailDomains))) {
    errors.email = 'email';
  }

  // El tipo de servicio ya no se pide en el formulario (recogida y destino lo dicen todo): es opcional.
  // Si llega (clientes antiguos o envíos directos), debe ser un id válido.
  data.service = oneLine(src.service);
  if (data.service && (!/^[a-z0-9-]{1,40}$/.test(data.service) || (serviceIds && !serviceIds.includes(data.service)))) {
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

  // Consentimiento: casilla obligatoria (Términos y Política de privacidad). Una casilla marcada llega como
  // "yes" (con JS) u "on" (sin JS). El servidor la exige: no basta con que el navegador la pida.
  data.consent = /^(yes|on|true)$/i.test(oneLine(src.consent)) ? 'yes' : '';
  if (!data.consent) errors.consent = 'consent';

  // Metadatos: valores cerrados, nunca texto libre.
  data.lang = src.lang === 'es' ? 'es' : 'en';
  data.ref = src.ref === 'card' ? 'card' : 'direct';

  return { ok: Object.keys(errors).length === 0, errors, data };
}

/**
 * Honeypot: el campo "hp_trap" está oculto para personas; si trae texto, lo más probable es un bot.
 * OJO: NO usar nombres que el autorrelleno del navegador reconozca (company, url, address...): Chrome
 * los rellena aunque estén ocultos y se perdían reservas reales. Por eso el servidor ya no finge éxito
 * con estos casos: devuelve un error visible para que una persona pueda reintentar.
 */
export const isSpam = (input) => oneLine(input?.hp_trap).length > 0;

/**
 * Tiempo mínimo de llenado. El formulario con JS manda en la cabecera X-Form-Elapsed los milisegundos
 * desde que se preparó el formulario. Si llega y es menor que el mínimo, es un bot (una persona, aun con
 * autocompletar, tiene que elegir servicio, fecha, hora y direcciones). Si NO llega (formulario sin JS o
 * una pestaña abierta con una versión anterior del sitio), no se juzga: así nunca se descarta en silencio
 * una reserva real.
 */
export const MIN_FILL_MS = 2500;
export function filledTooFast(elapsedHeader, min = MIN_FILL_MS) {
  const v = str(elapsedHeader).trim();
  if (!v) return false;
  return !/^\d{1,10}$/.test(v) || Number(v) < min;
}

/**
 * Comprueba la forma del cuerpo ANTES de validar: objeto plano con pocas claves y valores simples (texto,
 * número o booleano) de tamaño acotado. Objetos o arreglos anidados → null (petición inválida). Las claves
 * desconocidas se descartan (no se rechazan: así un campo nuevo del formulario no rompe las reservas).
 * @returns {Record<string, string> | null}
 */
export function plainInput(raw, { maxKeys = 30, maxValue = 2000 } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(raw);
  if (keys.length > maxKeys) return null;
  const out = {};
  for (const k of keys) {
    const v = raw[k];
    if (v == null) continue;
    if (!['string', 'number', 'boolean'].includes(typeof v)) return null;
    const s = String(v);
    if (s.length > maxValue) return null;
    if (k.length <= 40 && k !== '__proto__') out[k] = s;
  }
  return out;
}

/** Escapa texto para insertarlo en HTML. */
export const escapeHtml = (s) =>
  str(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
