/*
  Función serverless de Vercel: GET/POST /api/confirm.
  El chofer abre el enlace de su correo de reserva, escribe la tarifa y el servidor envía al pasajero la
  confirmación con los QR de pago (ver src/lib/confirm.js). Variables de entorno: las de /api/reserve más
  CONFIRM_SECRET (clave larga y aleatoria) y, opcionalmente, SITE_URL.
*/
import { handleConfirm } from '../src/lib/confirm.js';
import { parseBody } from '../src/lib/reservation.js';

const clientIp = (req) =>
  String(req.headers?.['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim() || req.socket?.remoteAddress;

export default async function handler(req, res) {
  const page = (status, html) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.end(html);
  };

  try {
    const method = req.method;
    const query = req.query ?? Object.fromEntries(new URL(req.url ?? '/', 'http://localhost').searchParams);
    const body = method === 'POST' ? parseBody(req.body, String(req.headers?.['content-type'] ?? '')) : {};
    const result = await handleConfirm({ method, query, body, ip: clientIp(req), env: process.env });
    return page(result.status, result.html);
  } catch (err) {
    // Sin detalles internos en la respuesta ni datos personales en el log.
    console.error(`confirm: error inesperado (${err?.name ?? 'Error'})`);
    return page(500, '<!doctype html><meta charset="utf-8"><title>Error</title><p>Something went wrong. Please try again.</p>');
  }
}
