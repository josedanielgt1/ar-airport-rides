/*
  Función serverless de Vercel: POST /api/reserve.
  - Con JS (fetch, JSON): responde JSON { ok, error?, errors? }.
  - Sin JS (formulario normal): redirige (303) a /#reserve-sent o /#reserve-error.
  Variables de entorno: RESEND_API_KEY, RESERVATION_TO_EMAIL, RESERVATION_FROM_EMAIL (ver .env.example).
  Si falta alguna responde 503 con un código genérico. Errores sin detalles internos; sin datos personales en logs.
*/
import { readFileSync } from 'node:fs';
import { handleReservation, parseBody } from '../src/lib/reservation.js';

const services = JSON.parse(readFileSync(new URL('../src/data/services.json', import.meta.url), 'utf-8'));
const SERVICE_IDS = services.items.map((s) => s.id);
const serviceName = (id) => services.items.find((s) => s.id === id)?.en.name ?? id;

const clientIp = (req) =>
  String(req.headers?.['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim() || req.socket?.remoteAddress;

export default async function handler(req, res) {
  const json = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(body));
  };

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const contentType = String(req.headers?.['content-type'] ?? '');
    const input = parseBody(req.body, contentType);
    const result = await handleReservation(input, {
      ip: clientIp(req),
      env: process.env,
      serviceIds: SERVICE_IDS,
      serviceName,
    });

    if (!contentType.includes('application/json')) {
      res.statusCode = 303;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Location', `/#${result.anchor}`);
      return res.end();
    }
    return json(result.status, result.body);
  } catch (err) {
    // Sin detalles internos en la respuesta ni datos personales en el log.
    console.error(`reserve: error inesperado (${err?.name ?? 'Error'})`);
    return json(500, { ok: false, error: 'unavailable' });
  }
}
