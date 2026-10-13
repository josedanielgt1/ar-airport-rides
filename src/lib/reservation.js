/*
  Lógica del servidor para /api/reserve, independiente de la plataforma: la usan la función de Vercel
  (api/reserve.js) y la simulación de desarrollo (vite.config.js). No se importa en el navegador.
  Nunca registra datos personales: los logs solo llevan códigos de estado.
*/
import { validateReservation, isSpam, todayIn, shiftDate, escapeHtml } from './validate.js';
import { confirmUrl as buildConfirmUrl } from './token.js';
import { mapsRouteUrl } from './maps.js';
import { payQrs, qrAttachments } from './qr.js';
import { vehicleDefaults, vehicleText, VEHICLE_COPY } from './vehicle.js';
import {
  C,
  layout,
  eyebrow,
  heading,
  highlight,
  detailRows,
  sectionTitle,
  goldButton,
  ghostButton,
  muted,
  paymentCards,
} from './email-ui.js';

const TZ = 'America/Chicago';
const RATE = { windowMs: 10 * 60 * 1000, max: 5 };
const hits = new Map(); // ip → marcas de tiempo (memoria de la instancia: límite de mejor esfuerzo)

/** true si la IP superó el límite de envíos en la ventana. */
export function rateLimited(ip, now = Date.now()) {
  const key = ip || 'unknown';
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // evita crecer sin límite en instancias largas
  return recent.length > RATE.max;
}

/**
 * Valor seguro para cabeceras (asunto, remitente, destinatario): sin saltos de línea ni caracteres de
 * control, para que nadie pueda inyectar cabeceras nuevas. Corta a 200 caracteres.
 */
export const headerSafe = (v) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\u2028\u2029\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 200);

/* ---------- Datos de pago (solo en el correo al chofer; nunca en el sitio) ---------- */

const PAY_HOSTS = { venmo: ['venmo.com', 'www.venmo.com', 'account.venmo.com'], cashapp: ['cash.app', 'www.cash.app'] };

/**
 * Opciones de pago desde variables de entorno (PAY_VENMO_URL, PAY_CASHAPP_URL, PAY_ZELLE).
 * Los enlaces deben ser https y del host esperado (venmo.com / cash.app), sin usuario ni clave.
 * Lo que falta o no es válido se omite (null); nunca se lanza un error.
 */
export function paymentOptions(env = {}) {
  const url = (value, hosts) => {
    try {
      const u = new URL(String(value ?? '').trim());
      if (u.protocol !== 'https:' || u.username || u.password || !hosts.includes(u.hostname)) return null;
      return u.href;
    } catch {
      return null;
    }
  };
  const zelle = headerSafe(env.PAY_ZELLE);
  return {
    venmo: url(env.PAY_VENMO_URL, PAY_HOSTS.venmo),
    cashapp: url(env.PAY_CASHAPP_URL, PAY_HOSTS.cashapp),
    zelle: /^[\w.+@() -]{3,80}$/.test(zelle) ? zelle : null,
  };
}

const CONFIRM = {
  en: {
    locale: 'en-US',
    subject: 'Your ride is confirmed – AR Airport Rides',
    hi: (n) => `Hi ${n}, your ride is confirmed.`,
    when: 'When',
    pickup: 'Pickup',
    dropoff: 'Drop-off',
    fare: 'Fare',
    pay: 'Payment options:',
    close: 'Questions? Just reply here. Thank you!',
  },
  es: {
    locale: 'es-US',
    subject: 'Tu traslado está confirmado – AR Airport Rides',
    hi: (n) => `Hola ${n}, tu traslado está confirmado.`,
    when: 'Cuándo',
    pickup: 'Recogida',
    dropoff: 'Destino',
    fare: 'Tarifa',
    pay: 'Formas de pago:',
    close: '¿Dudas? Respóndenos por aquí. ¡Gracias!',
  },
};

export const clock = (hhmm, lang) => {
  if (lang === 'es') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Mensaje de confirmación para el pasajero, en SU idioma, listo para que el chofer lo revise y lo envíe.
 * La tarifa queda como "[FARE]" para que la escriba él (o llega ya escrita en `fare`). Devuelve
 * { subject, body } en texto plano.
 */
export function confirmationMessage(data, pay = {}, fare = '[FARE]', vehicle = null) {
  const lang = data.lang === 'es' ? 'es' : 'en';
  const ride = vehicle ? vehicleText(vehicle, lang) : '';
  const m = CONFIRM[lang];
  const first = String(data.name).split(' ')[0];
  const day = new Intl.DateTimeFormat(m.locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${data.date}T12:00:00Z`),
  );
  const options = [
    pay.venmo && `- Venmo: ${pay.venmo}`,
    pay.cashapp && `- Cash App: ${pay.cashapp}`,
    pay.zelle && `- Zelle: ${pay.zelle}`,
  ].filter(Boolean);
  const lines = [
    m.hi(first),
    '',
    `${m.when}: ${day}, ${clock(data.time, lang)}`,
    `${m.pickup}: ${data.origin}`,
    `${m.dropoff}: ${data.destination}`,
    ...(ride ? [`${VEHICLE_COPY[lang].label}: ${ride}`] : []),
    ...(vehicle?.driver ? [`${VEHICLE_COPY[lang].driver}: ${vehicle.driver}`] : []),
    `${m.fare}: ${fare}`,
  ];
  if (options.length) lines.push('', m.pay, ...options);
  lines.push('', m.close, '— AR Airport Rides');
  return { subject: m.subject, body: lines.join('\n') };
}

const enc = encodeURIComponent;
const crlf = (s) => s.replace(/\n/g, '\r\n');

/** Enlace mailto: al correo del pasajero (el correo ya fue validado: sin espacios ni saltos de línea). */
export const mailtoLink = (email, { subject, body }) => `mailto:${email}?subject=${enc(subject)}&body=${enc(crlf(body))}`;

/** Teléfono en formato internacional para sms:, o null si no parece un número completo. */
export function smsNumber(phone) {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 10 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Enlace sms: con el texto prellenado. "?&body=" es la forma que leen a la vez iOS y Android. */
export const smsLink = (phone, { body }) => {
  const num = smsNumber(phone);
  return num ? `sms:${num}?&body=${enc(body)}` : null;
};

const LANG_NAME = { en: 'English (en)', es: 'Spanish (es)' };
const SOURCE = { card: 'QR card (ref=card)', direct: 'Direct visit' };

const longDate = (iso) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

// Textos de las tarjetas de pago en el correo del chofer (siempre en inglés).
const DRIVER_PAY_TEXT = { openVenmo: 'Open Venmo', openCashApp: 'Open Cash App', qrAlt: (n) => `${n} QR code` };

/**
 * Correo al chofer: formato fijo, siempre en inglés, con el idioma y el origen del visitante, diseño de la
 * marca (negro y dorado) y los QR de pago como imágenes en línea.
 * @param {object} [opts]
 * @param {{venmo?:string,cashapp?:string,zelle?:string}} [opts.pay] opciones de pago configuradas
 * @param {{venmo?:Buffer,cashapp?:Buffer}} [opts.qr] QR ya generados (PNG)
 * @param {string|null} [opts.confirmUrl] enlace para enviar la confirmación con QR al pasajero
 * @param {{description?:string, plate?:string, driver?:string}|null} [opts.vehicle] vehículo y conductor por defecto de la confirmación
 *   (solo se muestra junto al botón de confirmar, en una línea discreta; nunca en el asunto)
 */
export function buildEmail(data, { serviceName = (id) => id, now = new Date(), pay = {}, qr = {}, confirmUrl = null, vehicle = null } = {}) {
  const carOnFile = confirmUrl && vehicle ? vehicleText(vehicle, data.lang) : '';
  const driverOnFile = confirmUrl && vehicle?.driver ? vehicle.driver : '';
  // "Vehicle on file: … · Driver on file: …" (lo que exista). Solo con botón Confirmar; nunca en el asunto.
  const onFile = [carOnFile && `Vehicle on file: ${carOnFile}`, driverOnFile && `Driver on file: ${driverOnFile}`].filter(Boolean).join(' · ');
  // dateStyle/timeStyle no se pueden combinar con timeZoneName: campos explícitos.
  const received = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(now);

  const service = serviceName(data.service);
  const rows = [
    ['Visitor language', LANG_NAME[data.lang] ?? data.lang],
    ['Source', SOURCE[data.ref] ?? data.ref],
    ['Service', service],
    ['Date', `${longDate(data.date)} (${data.date})`],
    ['Time', data.time],
    ['Pickup', data.origin],
    ['Destination', data.destination],
    ['Passengers', String(data.passengers)],
    ['Name', data.name],
    ['Phone', data.phone],
    ['Email', data.email || '—'],
    ['Notes', data.notes || '—'],
    ['Received', `${received} (America/Chicago)`],
  ];

  const subject = headerSafe(`New ride request: ${service}, ${data.date} ${data.time}`);

  // Respuesta al pasajero: (1) confirmación con tarifa y QR enviada desde el servidor (si dio correo),
  // (2) mensaje listo para correo o SMS desde el teléfono del chofer. La tarifa queda como [FARE].
  const msg = confirmationMessage(data, pay);
  const mailto = data.email ? mailtoLink(data.email, msg) : null;
  const sms = smsLink(data.phone, msg);
  const noPay = !pay.venmo && !pay.cashapp && !pay.zelle;

  const text = [
    'New ride request from the AR Airport Rides website.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    '--- Reply to the passenger ---',
    ...(onFile ? [`${onFile} (you can change it before sending)`, ''] : []),
    ...(confirmUrl ? ['Send the confirmation with the fare and payment QR codes (opens a page to enter the fare):', confirmUrl, '', 'Or decline and ask them to pick another time (they get a link to the site):', `${confirmUrl}&a=decline`, ''] : []),
    ...(confirmUrl
      ? []
      : [
          data.email
            ? 'Reply to this email to answer them by email, or copy the message below. Replace [FARE] before sending.'
            : 'No email given: text them at the number above, or copy the message below. Replace [FARE] before sending.',
        ]),
    ...(noPay ? ['(No payment options configured: set PAY_VENMO_URL, PAY_CASHAPP_URL, PAY_ZELLE.)'] : []),
    ...(confirmUrl ? [] : ['', `Subject: ${msg.subject}`, msg.body]),
  ].join('\n');

  const actions = [
    confirmUrl && goldButton(confirmUrl, 'Send confirmation with QR'),
    confirmUrl && ghostButton(`${confirmUrl}&a=decline`, 'Decline and ask to reschedule'),
    !confirmUrl && mailto && ghostButton(mailto, 'Email payment details'),
    !confirmUrl && sms && ghostButton(sms, 'Text payment details'),
  ]
    .filter(Boolean)
    .join('\n');

  const body = [
    onFile
      ? `<p style="margin:0 0 18px;font:12px/1.5 Arial,Helvetica,sans-serif;color:${C.muted}">${[
          carOnFile && `Vehicle on file: <span style="color:${C.cream}">${escapeHtml(carOnFile)}</span>`,
          driverOnFile && `Driver on file: <span style="color:${C.cream}">${escapeHtml(driverOnFile)}</span>`,
        ]
          .filter(Boolean)
          .join(' &middot; ')} &middot; editable when you confirm</p>`
      : '',
    eyebrow('New ride request'),
    heading(service),
    highlight(longDate(data.date), data.time),
    `<p style="margin:14px 0 6px;font:16px/1.5 Arial,Helvetica,sans-serif;color:${C.cream}">${escapeHtml(data.origin)} <span style="color:${C.gold}">&rarr;</span> ${escapeHtml(data.destination)}</p>`,
    sectionTitle('Trip details'),
    detailRows(rows),
    `<div style="margin-top:14px">${ghostButton(mapsRouteUrl(data.origin, data.destination), 'Open route in Maps')}</div>`,
    sectionTitle('Reply to the passenger'),
    muted(
      confirmUrl
        ? 'Confirm: enter the fare, preview exactly what the passenger will get (with the payment QR codes) and send it. Decline: they receive a polite note with a link to pick another time.'
        : 'Opens a ready message in the passenger’s language. Replace [FARE] before sending.',
    ),
    actions,
    noPay
      ? `<p style="margin:8px 0;font:13px Arial,Helvetica,sans-serif;color:#E07B6A">No payment options configured (PAY_VENMO_URL, PAY_CASHAPP_URL, PAY_ZELLE).</p>`
      : '',
    ...(confirmUrl
      ? []
      : [
          sectionTitle('Message preview'),
          `<pre style="margin:0;padding:14px;background:${C.panel};border:1px solid ${C.line};border-radius:12px;font:13px/1.5 Arial,Helvetica,sans-serif;color:${C.cream};white-space:pre-wrap">${escapeHtml(msg.body)}</pre>`,
        ]),
  ].join('\n');

  // Todo valor variable pasa por escapeHtml (también el asunto en <title>).
  const html = layout({
    title: subject,
    preheader: `${longDate(data.date)} ${data.time} · ${data.origin} → ${data.destination}`,
    body,
    footer: 'Sent automatically from the AR Airport Rides website.',
  });

  return { subject, text, html, replyTo: data.email || undefined, attachments: [] };
}

/** Envía por la API REST de Resend (sin paquete). Devuelve true si Resend aceptó el correo. */
export async function sendWithResend({ apiKey, from, to, bcc }, { subject, text, html, replyTo, attachments }) {
  const payload = { from: headerSafe(from), to: [headerSafe(to)], subject: headerSafe(subject), text, html };
  // Responder al correo contesta directamente al pasajero (si dejó su correo).
  if (replyTo) payload.reply_to = headerSafe(replyTo);
  if (bcc) payload.bcc = [headerSafe(bcc)];
  // Imágenes en línea (QR de pago): { filename, content (base64), content_type, content_id }.
  if (attachments?.length) payload.attachments = attachments;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) console.error(`reserve: Resend respondió ${res.status}`);
  return res.ok;
}

/**
 * Procesa una solicitud. Devuelve { status, body, anchor }: body para respuestas JSON (con JS) y
 * anchor para la redirección sin JS (#reserve-sent / #reserve-error).
 * @param {object} input campos recibidos
 * @param {{ ip?: string, env?: Record<string,string|undefined>, serviceIds: string[],
 *           serviceName?: (id:string)=>string, send?: Function, now?: Date }} ctx
 */
export async function handleReservation(input, ctx) {
  const now = ctx.now ?? new Date();
  const sent = (extra = {}) => ({ status: 200, body: { ok: true, ...extra }, anchor: 'reserve-sent' });
  // Los errores solo llevan un código público; nunca detalles internos (configuración, proveedor, pila).
  const fail = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra }, anchor: 'reserve-error' });

  // Bots (honeypot): no se envía nada y se responde con un error visible (nunca éxito falso).
  if (isSpam(input)) return fail(400, 'verify');
  if (rateLimited(ctx.ip, now.getTime())) return fail(429, 'rate_limited');

  // Un día de margen por zona horaria: la fecha mínima es "ayer" en Austin.
  const today = shiftDate(todayIn(TZ, now), -1);
  const { ok, errors, data } = validateReservation(input, { serviceIds: ctx.serviceIds, today });
  if (!ok) return fail(422, 'invalid', { errors });

  const env = ctx.env ?? {};
  const config = { apiKey: env.RESEND_API_KEY, to: env.RESERVATION_TO_EMAIL, from: env.RESERVATION_FROM_EMAIL };
  const send = ctx.send ?? sendWithResend;
  if (!ctx.send && (!config.apiKey || !config.to || !config.from)) {
    console.error('reserve: faltan variables de entorno de correo');
    return fail(503, 'unavailable');
  }

  try {
    const pay = ctx.pay ?? paymentOptions(env);
      // Enlace para que el chofer envíe la confirmación con tarifa y QR (solo si el pasajero dejó correo y hay CONFIRM_SECRET).
    const confirmUrl = data.email
      ? buildConfirmUrl(env, {
          name: data.name,
          email: data.email,
          lang: data.lang,
          date: data.date,
          time: data.time,
          origin: data.origin,
          destination: data.destination,
          passengers: data.passengers,
        })
      : null;
    const delivered = await send(config, buildEmail(data, { serviceName: ctx.serviceName, now, pay, confirmUrl, vehicle: vehicleDefaults(env, data.lang) }));
    if (delivered === false) return fail(502, 'unavailable');
    return sent(delivered && typeof delivered === 'object' ? delivered : {});
  } catch (err) {
    console.error(`reserve: error al enviar (${err?.name ?? 'Error'})`);
    return fail(502, 'unavailable');
  }
}

/** Convierte el cuerpo recibido (objeto, JSON o urlencoded) en un objeto plano. */
export function parseBody(raw, contentType = '') {
  if (raw && typeof raw === 'object' && !Buffer.isBuffer?.(raw)) return raw;
  const s = Buffer.isBuffer?.(raw) ? raw.toString('utf8') : String(raw ?? '');
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(s || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(s));
}
