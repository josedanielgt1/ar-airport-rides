/*
  Lógica del servidor para /api/reserve, independiente de la plataforma: la usan la función de Vercel
  (api/reserve.js) y la simulación de desarrollo (vite.config.js). No se importa en el navegador.
  Nunca registra datos personales: los logs solo llevan códigos de estado.
*/
import { validateReservation, isSpam, todayIn, shiftDate, escapeHtml } from './validate.js';

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

const LANG_NAME = { en: 'English (en)', es: 'Spanish (es)' };
const SOURCE = { card: 'QR card (ref=card)', direct: 'Direct visit' };

const longDate = (iso) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/** Correo en formato fijo, siempre en inglés, con el idioma y el origen del visitante. */
export function buildEmail(data, { serviceName = (id) => id, now = new Date() } = {}) {
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
    ['Notes', data.notes || '—'],
    ['Received', `${received} (America/Chicago)`],
  ];

  const subject = `New ride request: ${service}, ${data.date} ${data.time}`;
  const text = ['New ride request from the AR Airport Rides website.', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111">
<p style="margin:0 0 12px">New ride request from the AR Airport Rides website.</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([k, v]) =>
      `<tr><th align="left" valign="top" style="border-bottom:1px solid #ddd;white-space:nowrap">${escapeHtml(k)}</th><td style="border-bottom:1px solid #ddd;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
  )
  .join('\n')}
</table></body></html>`;

  return { subject, text, html };
}

/** Envía por la API REST de Resend (sin paquete). Devuelve true si Resend aceptó el correo. */
export async function sendWithResend({ apiKey, from, to }, { subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
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
  const fail = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra }, anchor: 'reserve-error' });

  // Bots: se responde como si todo fuera bien, sin enviar nada.
  if (isSpam(input)) return sent();
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
    return fail(503, 'not_configured', { message: 'Email delivery is not configured yet.' });
  }

  try {
    const delivered = await send(config, buildEmail(data, { serviceName: ctx.serviceName, now }));
    if (delivered === false) return fail(502, 'send_failed');
    return sent(delivered && typeof delivered === 'object' ? delivered : {});
  } catch (err) {
    console.error(`reserve: error al enviar (${err?.name ?? 'Error'})`);
    return fail(502, 'send_failed');
  }
}

/** Convierte el cuerpo recibido (objeto, JSON o urlencoded) en un objeto plano. */
export function parseBody(raw, contentType = '') {
  if (raw && typeof raw === 'object' && !Buffer.isBuffer?.(raw)) return raw;
  const s = Buffer.isBuffer?.(raw) ? raw.toString('utf8') : String(raw ?? '');
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(s || '{}');
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(s));
}
