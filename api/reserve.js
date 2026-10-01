/*
  Función serverless de Vercel: POST /api/reserve.
  - Con JS (fetch, JSON): responde JSON { ok, error?, errors? }.
  - Sin JS (formulario normal): redirige (303) a /#reserve-sent o /#reserve-error.
  Variables de entorno: RESEND_API_KEY, RESERVATION_TO_EMAIL, RESERVATION_FROM_EMAIL (ver .env.example).
  Si falta alguna responde 503 sin romper la página. No registra datos personales.
*/
import { readFileSync } from 'node:fs';
import { handleReservation, parseBody } from '../src/lib/reservation.js';

const services = JSON.parse(readFileSync(new URL('../src/data/services.json', import.meta.url), 'utf-8'));
const SERVICE_IDS = services.items.map((s) => s.id);
const serviceName = (id) => services.items.find((s) => s.id === id)?.en.name ?? id;

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim() || req.socket?.remoteAddress;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }

  const contentType = String(req.headers['content-type'] ?? '');
  const input = parseBody(req.body, contentType);
  const result = await handleReservation(input, {
    ip: clientIp(req),
    env: process.env,
    serviceIds: SERVICE_IDS,
    serviceName,
  });

  res.setHeader('Cache-Control', 'no-store');
  if (!contentType.includes('application/json')) {
    res.statusCode = 303;
    res.setHeader('Location', `/#${result.anchor}`);
    return res.end();
  }
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(result.body));
}
