import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleReservation,
  buildEmail,
  parseBody,
  rateLimited,
  headerSafe,
  paymentOptions,
  confirmationMessage,
  mailtoLink,
  smsLink,
  smsNumber,
  sendWithResend,
} from '../src/lib/reservation.js';
import handler from '../api/reserve.js';

const IDS = ['city', 'airport'];
const NOW = new Date('2026-10-01T20:04:00Z'); // 3:04 PM en Austin (CDT)
// Fecha de viaje siempre futura (también para el handler real, que valida contra la fecha de hoy).
const TRIP_DATE = new Date(Math.max(Date.now(), NOW.getTime()) + 30 * 86400000).toISOString().slice(0, 10);
const input = (extra = {}) => ({
  name: 'Ana López',
  phone: '737-529-1720',
  service: 'airport',
  date: TRIP_DATE,
  time: '07:30',
  origin: 'Downtown <b>Austin</b>',
  destination: 'AUS',
  passengers: '2',
  email: 'ana@example.com',
  notes: '',
  lang: 'es',
  ref: 'card',
  ...extra,
});
let ipSeq = 0;
const ctx = (extra = {}) => ({ ip: `10.0.0.${++ipSeq}`, serviceIds: IDS, now: NOW, ...extra });

test('honeypot: error visible (400 verify), nunca éxito falso, sin enviar', async () => {
  let calls = 0;
  const send = async () => (calls++, true);
  const spam = await handleReservation(input({ hp_trap: 'bot' }), ctx({ send }));
  const real = await handleReservation(input(), ctx({ send }));
  assert.equal(calls, 1, 'solo el envío real llama a send');
  assert.equal(spam.status, 400);
  assert.deepEqual(spam.body, { ok: false, error: 'verify' });
  assert.equal(real.status, 200);
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
  assert.ok(subject.includes(`Airport (AUS), ${TRIP_DATE} 07:30`));
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

/* ---------- Pagos y respuesta al pasajero (opción C) ---------- */

const PAY = {
  venmo: 'https://venmo.com/u/ar-rides',
  cashapp: 'https://cash.app/$arrides',
  zelle: 'pagos@example.com',
};
const withEmail = () => ({ ...input(), passengers: 2, email: 'ana@example.com' });

test('paymentOptions: solo https y hosts esperados; lo inválido se omite', () => {
  const ok = paymentOptions({ PAY_VENMO_URL: 'https://venmo.com/u/ar-rides', PAY_CASHAPP_URL: 'https://cash.app/$arrides', PAY_ZELLE: '(737) 529-1720' });
  assert.equal(ok.venmo, 'https://venmo.com/u/ar-rides');
  assert.equal(ok.cashapp, 'https://cash.app/$arrides');
  assert.equal(ok.zelle, '(737) 529-1720');

  const bad = paymentOptions({
    PAY_VENMO_URL: 'http://venmo.com/u/x', // sin https
    PAY_CASHAPP_URL: 'https://cash.app.evil.com/$x', // host parecido
    PAY_ZELLE: 'x<script>alert(1)</script>',
  });
  assert.deepEqual(bad, { venmo: null, cashapp: null, zelle: null });

  for (const v of ['javascript:alert(1)', 'https://evilvenmo.com/u/x', 'https://user:pw@venmo.com/u/x', 'venmo.com/u/x', '']) {
    assert.equal(paymentOptions({ PAY_VENMO_URL: v }).venmo, null, v);
  }
  assert.deepEqual(paymentOptions({}), { venmo: null, cashapp: null, zelle: null });
  assert.deepEqual(paymentOptions(), { venmo: null, cashapp: null, zelle: null });
});

test('confirmationMessage: en el idioma del pasajero, con [FARE] y los pagos configurados', () => {
  const en = confirmationMessage({ ...input({ lang: 'en', name: 'Ana López' }), passengers: 2 }, PAY);
  assert.match(en.subject, /Your ride is confirmed/);
  assert.match(en.body, /^Hi Ana,/);
  assert.match(en.body, /Fare: \[FARE\]/);
  assert.match(en.body, /7:30 AM/);
  assert.ok(en.body.includes('- Venmo: https://venmo.com/u/ar-rides'));
  assert.ok(en.body.includes('- Cash App: https://cash.app/$arrides'));
  assert.ok(en.body.includes('- Zelle: pagos@example.com'));

  const es = confirmationMessage({ ...input({ lang: 'es' }), passengers: 2 }, PAY);
  assert.match(es.subject, /Tu traslado está confirmado/);
  assert.match(es.body, /^Hola Ana,/);
  assert.match(es.body, /Tarifa: \[FARE\]/);
  assert.match(es.body, /Formas de pago:/);
  assert.match(es.body, /07:30/);

  const none = confirmationMessage({ ...input(), passengers: 2 }, {});
  assert.ok(!/Formas de pago|Payment options/.test(none.body), 'sin pagos configurados no hay sección de pagos');
});

test('mailto y sms: codificados, con CRLF, y sin romperse con acentos, & y saltos de línea', () => {
  const msg = confirmationMessage({ ...input({ name: 'José & Co', origin: 'A&B "Calle" #1', destination: 'AUS' }), passengers: 2 }, PAY);
  const mail = mailtoLink('ana@example.com', msg);
  assert.ok(mail.startsWith('mailto:ana@example.com?subject='));
  const body = decodeURIComponent(mail.split('&body=')[1]);
  assert.ok(body.includes('\r\n'), 'saltos de línea CRLF');
  assert.ok(body.includes('A&B "Calle" #1'));
  assert.ok(!/[ \n"<>]/.test(mail), 'enlace sin espacios, saltos ni comillas sin codificar');

  const sms = smsLink('(737) 529-1720', msg);
  assert.ok(sms.startsWith('sms:+17375291720?&body='));
  assert.ok(!/[ \n"<>]/.test(sms));
  assert.equal(smsLink('12345', msg), null, 'teléfono incompleto: sin botón');
});

test('smsNumber: formatos de EE. UU. e internacionales', () => {
  assert.equal(smsNumber('737-529-1720'), '+17375291720');
  assert.equal(smsNumber('1 (737) 529-1720'), '+17375291720');
  assert.equal(smsNumber('+52 424 708 0082'), '+524247080082');
  assert.equal(smsNumber('529-1720'), null);
});

test('mailto con textos largos sigue en un tamaño razonable', () => {
  const long = 'x'.repeat(160);
  const msg = confirmationMessage({ ...input({ origin: long, destination: long, lang: 'es' }), passengers: 2 }, PAY);
  assert.ok(mailtoLink('ana@example.com', msg).length < 2200);
});

test('buildEmail con correo del pasajero: botones de correo y SMS, reply-to y HTML escapado', () => {
  const data = { ...withEmail(), name: '<img src=x onerror=alert(1)>', lang: 'es' };
  const { html, text, replyTo } = buildEmail(data, { serviceName: () => 'Airport (AUS)', now: NOW, pay: PAY });
  assert.equal(replyTo, 'ana@example.com');
  assert.ok(html.includes('Email payment details'));
  assert.ok(html.includes('Text payment details'));
  assert.ok(html.includes('href="mailto:ana@example.com?subject='));
  assert.ok(html.includes('&amp;body='), 'el & del enlace va escapado en el HTML');
  assert.ok(!html.includes('<img src=x'), 'el nombre del pasajero no entra como HTML');
  assert.match(text, /Email: ana@example\.com/);
  assert.match(text, /Hola /, 'el mensaje de confirmación va en el idioma del pasajero (es)');
  assert.ok(!html.includes('No payment options configured'));
});

test('buildEmail sin correo del pasajero: solo SMS y sin reply-to', () => {
  const { html, text, replyTo } = buildEmail({ ...input({ email: '' }), passengers: 2 }, { now: NOW, pay: PAY });
  assert.equal(replyTo, undefined);
  assert.ok(!html.includes('Email payment details'));
  assert.ok(html.includes('Text payment details'));
  assert.match(text, /No email given/);
});

test('buildEmail sin datos de pago: avisa al chofer y no inventa nada', () => {
  const { html, text } = buildEmail(withEmail(), { now: NOW });
  assert.ok(html.includes('No payment options configured'));
  assert.match(text, /No payment options configured/);
  assert.ok(!/venmo\.com|cash\.app/.test(html + text));
});

test('handleReservation: los datos de pago salen de las variables de entorno', async () => {
  let email;
  const send = async (_cfg, e) => ((email = e), true);
  const env = { PAY_VENMO_URL: PAY.venmo, PAY_CASHAPP_URL: PAY.cashapp, PAY_ZELLE: PAY.zelle };
  const r = await handleReservation(withEmail(), ctx({ send, env }));
  assert.equal(r.status, 200);
  assert.ok(email.text.includes(PAY.venmo));
  assert.equal(email.replyTo, 'ana@example.com');

  const r2 = await handleReservation(withEmail(), ctx({ send, env: {} }));
  assert.equal(r2.status, 200);
  assert.ok(!email.text.includes('venmo.com'));
});

test('handleReservation: correo del pasajero inválido o con inyección de cabeceras → 422', async () => {
  const send = async () => true;
  for (const email of ['no-es-correo', 'ana@example.com\r\nBcc: victim@example.com', '<ana@example.com>']) {
    const r = await handleReservation(input({ email }), ctx({ send }));
    assert.equal(r.status, 422, email);
    assert.equal(r.body.errors.email, 'email');
  }
});

test('sendWithResend: reply_to solo si hay correo del pasajero, y sin saltos de línea', async () => {
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => ((bodies.push(JSON.parse(init.body)), { ok: true }));
  try {
    const cfg = { apiKey: 're_test', from: 'AR <a@b.com>', to: 'driver@example.com' };
    await sendWithResend(cfg, { subject: 's', text: 't', html: 'h', replyTo: 'ana@example.com\r\nBcc: v@x.com' });
    await sendWithResend(cfg, { subject: 's', text: 't', html: 'h' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(bodies[0].reply_to, 'ana@example.com Bcc: v@x.com'.slice(0, 200));
  assert.ok(!/[\r\n]/.test(bodies[0].reply_to));
  assert.ok(!('reply_to' in bodies[1]));
});