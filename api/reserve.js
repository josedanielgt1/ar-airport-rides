/*
  Función serverless de Vercel: POST /api/reserve.
  - Con JS (fetch, JSON): responde JSON { ok, error?, errors? }.
  - Sin JS (formulario normal): redirige (303) a /#reserve-sent o /#reserve-error.
  Variables de entorno: RESEND_API_KEY, RESERVATION_TO_EMAIL, RESERVATION_FROM_EMAIL (ver .env.example).
  Opcional: ALLOWED_ORIGINS (orígenes extra separados por coma, p. ej. un dominio nuevo).
  Si falta alguna responde 503 con un código genérico. Errores sin detalles internos; sin datos personales en logs.

  Antiabuso (en este orden, todo antes de leer el cuerpo cuando se puede):
  1. Solo POST; cuerpo de 16 KB como máximo; Content-Type application/json (formulario con JS) o
     application/x-www-form-urlencoded (formulario sin JS). Todo lo demás (text/plain, multipart…) → 415.
  2. Mismo origen (CSRF): Sec-Fetch-Site / Origin / Referer, ver sameOriginRequest en src/lib/ratelimit.js.
  3. Límite por IP (IP que pone Vercel, nunca X-Forwarded-For del cliente).
  4. Forma del cuerpo: objeto plano, valores simples y acotados (nada anidado).
  5. Bots: honeypot "company" y tiempo mínimo de llenado (cabecera X-Form-Elapsed). Reciben EXACTAMENTE la
     misma respuesta que una reserva real y no se envía nada.
  6. Límite por correo y por teléfono del pasajero, y tope global de envíos de la instancia.
  Los límites viven en memoria de la instancia ("mejor esfuerzo"). La capa fuerte es una regla de Rate
  Limiting en Vercel Firewall sobre /api/reserve (ver informe de seguridad, SEC-02).
*/
import { readFileSync } from 'node:fs';
import { handleReservation, parseBody } from '../src/lib/reservation.js';
import { plainInput, isSpam, filledTooFast, validateReservation } from '../src/lib/validate.js';
import { guards, clientIp, sameOriginRequest, emailKey, phoneKey } from '../src/lib/ratelimit.js';

const services = JSON.parse(readFileSync(new URL('../src/data/services.json', import.meta.url), 'utf-8'));
const SERVICE_IDS = services.items.map((s) => s.id);
const serviceName = (id) => services.items.find((s) => s.id === id)?.en.name ?? id;

export const MAX_BODY_BYTES = 16 * 1024;

const mediaType = (ct) => String(ct ?? '').split(';')[0].trim().toLowerCase();

export default async function handler(req, res) {
  let wantsJson = true;
  const json = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(JSON.stringify(body));
  };
  const redirect = (anchor) => {
    res.statusCode = 303;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Location', `/#${anchor}`);
    return res.end();
  };
  // Respuesta de error genérica: JSON para fetch, redirección al ancla de error para el formulario sin JS.
  const reject = (status, error) => (wantsJson ? json(status, { ok: false, error }) : redirect('reserve-error'));
  // Lo que ve un bot descartado: idéntico a una reserva aceptada.
  const fakeSent = () => (wantsJson ? json(200, { ok: true }) : redirect('reserve-sent'));

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const headers = req.headers ?? {};
    const type = mediaType(headers['content-type']);
    const isJson = type === 'application/json';
    const isForm = type === 'application/x-www-form-urlencoded';
    wantsJson = !isForm;
    if (!isJson && !isForm) return json(415, { ok: false, error: 'unsupported' });

    const length = Number(headers['content-length'] ?? 0);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return reject(413, 'too_large');

    const env = process.env;
    if (!sameOriginRequest(req, { json: isJson, env })) return reject(403, 'forbidden');

    const now = Date.now();
    const ip = clientIp(req);
    if (guards.ip.hit(ip, now)) return reject(429, 'rate_limited');

    // Vercel parsea el cuerpo al leer req.body (por eso va después de los chequeos baratos).
    let raw;
    try {
      raw = req.body;
    } catch {
      return reject(400, 'invalid_request'); // JSON mal formado
    }
    if (typeof raw === 'string' && raw.length > MAX_BODY_BYTES) return reject(413, 'too_large');
    const input = plainInput(parseBody(raw, isJson ? 'application/json' : type));
    if (!input) return reject(400, 'invalid_request');

    if (isSpam(input) || filledTooFast(headers['x-form-elapsed'])) return fakeSent();

    // Límites por pasajero y tope global: solo para solicitudes que de verdad generarían un correo.
    const check = validateReservation(input, { serviceIds: SERVICE_IDS });
    if (check.ok) {
      const keys = [
        [guards.phone, phoneKey(check.data.phone)],
        [guards.email, check.data.email ? emailKey(check.data.email) : null],
        [guards.global, 'all'],
      ].filter(([, k]) => k);
      if (keys.some(([limiter, k]) => limiter.wouldExceed(k, now))) return reject(429, 'rate_limited');
      for (const [limiter, k] of keys) limiter.hit(k, now);
    }

    const result = await handleReservation(input, {
      ip,
      env,
      serviceIds: SERVICE_IDS,
      serviceName,
    });

    if (!wantsJson) return redirect(result.anchor);
    return json(result.status, result.body);
  } catch (err) {
    // Sin detalles internos en la respuesta ni datos personales en el log.
    console.error(`reserve: error inesperado (${err?.name ?? 'Error'})`);
    return json(500, { ok: false, error: 'unavailable' });
  }
}
