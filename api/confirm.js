/*
  Función serverless de Vercel: GET/POST /api/confirm.
  El chofer abre el enlace de su correo de reserva, escribe la tarifa y el servidor envía al pasajero la
  confirmación con los QR de pago (ver src/lib/confirm.js). Variables de entorno: las de /api/reserve más
  CONFIRM_SECRET (>= 32 caracteres aleatorios), opcionalmente CONFIRM_SECRET_PREVIOUS (rotación) y SITE_URL.

  El token viaja en la URL (?t=), así que TODAS las respuestas llevan: sin caché (no-store), sin Referer
  (no-referrer, también como <meta> en la página), sin indexar, y la página no carga nada de terceros salvo
  el mapa opcional dentro de la vista previa (que hereda no-referrer).
*/
import { handleConfirm } from '../src/lib/confirm.js';
import { parseBody } from '../src/lib/reservation.js';

/** IP del cliente: la que pone Vercel (x-real-ip / x-vercel-forwarded-for) antes que X-Forwarded-For. */
const clientIp = (req) => {
  const h = req.headers ?? {};
  const first = (v) => String(v ?? '').split(',')[0].trim();
  return first(h['x-real-ip']) || first(h['x-vercel-forwarded-for']) || first(h['x-forwarded-for']) || req.socket?.remoteAddress;
};

export const SECURITY_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default async function handler(req, res) {
  const page = (status, html, extra = {}) => {
    res.statusCode = status;
    for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) res.setHeader(k, v);
    return res.end(html);
  };

  try {
    const method = req.method;
    const headers = req.headers ?? {};
    const query = req.query ?? Object.fromEntries(new URL(req.url ?? '/', 'http://localhost').searchParams);
    const body = method === 'POST' ? parseBody(req.body, String(headers['content-type'] ?? '')) : {};
    const result = await handleConfirm({ method, query, body, headers, ip: clientIp(req), env: process.env });
    return page(result.status, result.html, result.headers);
  } catch (err) {
    // Sin detalles internos en la respuesta ni datos personales en el log.
    console.error(`confirm: error inesperado (${err?.name ?? 'Error'})`);
    return page(500, '<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Error</title><p>Something went wrong. Please try again.</p>');
  }
}
