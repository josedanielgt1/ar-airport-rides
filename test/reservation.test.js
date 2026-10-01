import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReservation, buildEmail, parseBody, rateLimited, headerSafe } from '../src/lib/reservation.js';
import handler from '../api/reserve.js';

const IDS = ['city', 'airport'];
const NOW = new Date('2026-10-01T20:04:00Z'); // 3:04 PM en Austin (CDT)
const input = (extra = {}) => ({
  name: 'Ana López',
  phone: '737-529-1720',
  service: 'airport',
  date: '2026-10-02',
  time: '07:30',
  origin: 'Downtown <b>Austin</b>',
  destination: 'AUS',
  passengers: '2',
  notes: '',
  lang: 'es',
  ref: 'card',
  ...extra,
});
let ipSeq = 0;
const ctx = (extra = {}) => ({ ip: `10.0.0.${++ipSeq}`, serviceIds: IDS, now: NOW, ...extra });

test('honeypot: misma respuesta que un éxito real, sin enviar', async () => {
  let calls = 0;
  const send = async () => (calls++, true);
  const spam = await handleReservation(input({ company: 'bot' }), ctx({ send }));
  const real = await handleReservation(input(), ctx({ send }));
  assert.equal(calls, 1, 'solo el envío real llama a send');
  assert.deepEqual(spam, real);
});

test('datos inválidos: 422 con errores por campo', async () => {
  const r = await handleReservation(input({ phone: 'x' }), ctx({ send: async () => true }));
  assert.equal(r.status, 422);
  assert.equal(r.body.errors.phone, 'phone');
  assert.equal(r.anchor, 'reserve-error');
});

test('sin variables de entorno: 503 con código genérico, sin detalles internos', async () => {
  const r = await handleReservation(input(), ctx({ env: {} }));
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, error: 'unavailable' });
});

test('envío correcto y fallo del proveedor', async () => {
  const ok = await handleReservation(input(), ctx({ send: async () => true }));
  assert.equal(ok.status, 200);
  const bad = await handleReservation(input(), ctx({ send: async () => false }));
  assert.equal(bad.status, 502);
  assert.deepEqual(bad.body, { ok: false, error: 'unavailable' });
  const thrown = await handleReservation(input(), ctx({ send: async () => { throw new Error('secreto interno'); } }));
  assert.equal(thrown.status, 502);
  assert.ok(!JSON.stringify(thrown.body).includes('secreto'));
});

test('límite de envíos por IP', () => {
  const ip = '192.0.2.1';
  const t = Date.now();
  const results = Array.from({ length: 6 }, (_, i) => rateLimited(ip, t + i));
  assert.deepEqual(results, [false, false, false, false, false, true]);
  assert.equal(rateLimited(ip, t + 11 * 60 * 1000), false, 'la ventana se libera');
});

test('correo en inglés con idioma, origen y hora de Chicago, y HTML escapado', () => {
  const data = { ...input(), passengers: 2 };
  const { subject, text, html } = buildEmail(data, { serviceName: () => 'Airport (AUS)', now: NOW });
  assert.match(subject, /Airport \(AUS\), 2026-10-02 07:30/);
  assert.match(text, /Visitor language: Spanish \(es\)/);
  assert.match(text, /Source: QR card \(ref=card\)/);
  assert.match(text, /Received: .*3:04.PM.*CDT.*America\/Chicago/);
  assert.ok(html.includes('Downtown &lt;b&gt;Austin&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Austin</b>'));
});

test('asunto y cabeceras sin saltos de línea (no se pueden inyectar cabeceras)', () => {
  const { subject, html } = buildEmail({ ...input(), passengers: 2 }, {
    serviceName: () => 'Airport\r\nBcc: victim@example.com',
    now: NOW,
  });
  assert.ok(!/[\r\n]/.test(subject));
  assert.match(subject, /Airport Bcc: victim@example.com/);
  assert.equal(headerSafe('a\r\nb\u2028c\u0000d'), 'a b c d');
  assert.ok(html.includes('<title>New ride request: Airport Bcc: victim@example.com'));
});

test('parseBody: JSON, urlencoded y objeto', () => {
  assert.deepEqual(parseBody('{"a":"1"}', 'application/json'), { a: '1' });
  assert.deepEqual(parseBody('a=1&b=x+y', 'application/x-www-form-urlencoded'), { a: '1', b: 'x y' });
  assert.deepEqual(parseBody({ a: 1 }), { a: 1 });
  assert.deepEqual(parseBody('{roto', 'application/json'), {});
  assert.deepEqual(parseBody('[1,2]', 'application/json'), {});
});

// Respuesta mínima compatible con la de Node.
const fakeRes = () => {
  const r = { statusCode: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v);
  r.end = (b = '') => ((r.body = b), r);
  return r;
};

test('api/reserve: GET → 405', async () => {
  const res = fakeRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('api/reserve: sin JS (urlencoded) redirige con 303 al ancla', async () => {
  const res = fakeRes();
  const body = new URLSearchParams({ ...input(), service: 'airport' }).toString();
  const saved = { ...process.env };
  delete process.env.RESEND_API_KEY;
  await handler({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '198.51.100.7' }, body }, res);
  Object.assign(process.env, saved);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/#reserve-error'); // sin configuración de correo
});

test('api/reserve: JSON sin configuración → 503 JSON', async () => {
  const res = fakeRes();
  const saved = { ...process.env };
  delete process.env.RESEND_API_KEY;
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.8' }, body: input() }, res);
  Object.assign(process.env, saved);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'unavailable' });
});

test('api/reserve: un error inesperado responde 500 genérico', async () => {
  const res = fakeRes();
  const req = { method: 'POST' };
  Object.defineProperty(req, 'headers', { get() { throw new Error('detalle interno'); } });
  await handler(req, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'unavailable' });
});
