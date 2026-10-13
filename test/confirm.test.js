import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealToken, openToken, secretOk, siteUrl, confirmUrl } from '../src/lib/token.js';
import { qrPng, payQrs, qrAttachments } from '../src/lib/qr.js';
import { parseFare, buildConfirmationEmail, handleConfirm } from '../src/lib/confirm.js';
import { buildEmail, handleReservation, sendWithResend } from '../src/lib/reservation.js';
import handler from '../api/confirm.js';

const SECRET = 'una-clave-larga-y-aleatoria-0123456789';
const NOW = new Date('2026-10-01T20:04:00Z');
const PAY = { venmo: 'https://venmo.com/u/ar-rides', cashapp: 'https://cash.app/$arrides', zelle: 'pagos@example.com' };
const TRIP = {
  name: 'Ana López',
  email: 'ana@example.com',
  lang: 'es',
  date: '2026-10-20',
  time: '09:30',
  origin: 'Congress Ave <b>1</b>',
  destination: 'AUS',
  passengers: 2,
};
const ENV = {
  CONFIRM_SECRET: SECRET,
  SITE_URL: 'https://ejemplo.vercel.app',
  RESEND_API_KEY: 're_test',
  RESERVATION_FROM_EMAIL: 'AR <reservas@example.com>',
  RESERVATION_TO_EMAIL: 'chofer@example.com',
};
let ipSeq = 0;
const ip = () => `10.1.0.${++ipSeq}`;

test('token: ida y vuelta, vencimiento y alteración', () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  assert.match(t, /^[A-Za-z0-9_-]+$/, 'seguro para una URL');
  assert.ok(!t.includes('Ana') && !t.includes('ana@example.com'), 'los datos no se leen en el enlace');
  const data = openToken(t, SECRET, NOW.getTime() + 1000);
  assert.equal(data.email, 'ana@example.com');
  assert.equal(data.origin, TRIP.origin);

  assert.equal(openToken(t, SECRET, NOW.getTime() + 25 * 3600000), null, 'vence a las 24 h');
  assert.equal(openToken(t, 'otra-clave-distinta-0123456789', NOW.getTime()), null, 'otra clave no abre');
  const bad = t.slice(0, -4) + (t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal(openToken(bad, SECRET, NOW.getTime()), null, 'alterado');
  for (const junk of ['', 'x', null, undefined, '%%%', 'a'.repeat(200)]) assert.equal(openToken(junk, SECRET), null);
});

test('secretOk y siteUrl: no se toman de la petición y solo https', () => {
  assert.equal(secretOk({ CONFIRM_SECRET: 'corta' }), false);
  assert.equal(secretOk({ CONFIRM_SECRET: SECRET }), true);
  assert.equal(secretOk({}), false);

  assert.equal(siteUrl({ SITE_URL: 'https://mi-sitio.com/ruta?x=1' }), 'https://mi-sitio.com');
  assert.equal(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'ar-airport-rides.vercel.app' }), 'https://ar-airport-rides.vercel.app');
  assert.equal(siteUrl({ SITE_URL: 'http://mi-sitio.com' }), null, 'http no');
  assert.equal(siteUrl({ SITE_URL: 'http://localhost:5173' }), 'http://localhost:5173', 'localhost sí (desarrollo)');
  assert.equal(siteUrl({ SITE_URL: 'https://user:pw@evil.com' }), null);
  assert.equal(siteUrl({ SITE_URL: 'javascript:alert(1)' }), null);
  assert.equal(siteUrl({}), null);

  assert.equal(confirmUrl({ ...ENV, CONFIRM_SECRET: '' }, TRIP), null, 'sin clave no hay enlace');
  assert.match(confirmUrl(ENV, TRIP), /^https:\/\/ejemplo\.vercel\.app\/api\/confirm\?t=[\w-]+$/);
});

test('parseFare: montos válidos y rechazo del resto', () => {
  assert.equal(parseFare('85'), '$85.00');
  assert.equal(parseFare('$85.5'), '$85.50');
  assert.equal(parseFare(' 85,50 '), '$85.50');
  assert.equal(parseFare('1250'), '$1,250.00');
  for (const bad of ['', '0', '0.00', 'abc', '-5', '85.555', '1,000', '123456', '$', '85 USD', '<b>', null, undefined]) {
    assert.equal(parseFare(bad), null, String(bad));
  }
});

test('QR: PNG válido, adjuntos en línea con content_id y omisión si no hay enlace', async () => {
  const png = await qrPng(PAY.venmo);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'firma PNG');

  const qr = await payQrs(PAY);
  assert.deepEqual(Object.keys(qr).sort(), ['cashapp', 'venmo']);
  assert.deepEqual(await payQrs({ zelle: 'pagos@example.com' }), {}, 'Zelle no tiene QR');
  assert.deepEqual(await payQrs({}), {});

  const att = qrAttachments(qr);
  assert.equal(att.length, 2);
  assert.deepEqual(att.map((a) => a.content_id).sort(), ['cashapp-qr', 'venmo-qr']);
  assert.ok(att.every((a) => a.content_type === 'image/png' && a.filename.endsWith('.png') && /^[A-Za-z0-9+/=]+$/.test(a.content)));
});

test('correo al pasajero: en su idioma, con tarifa, QR en línea y todo escapado', async () => {
  const qr = await payQrs(PAY);
  const es = buildConfirmationEmail(TRIP, '$85.00', PAY, qr);
  assert.match(es.subject, /Tu traslado está confirmado/);
  assert.ok(es.html.includes('Nos vemos pronto, Ana.'));
  assert.ok(es.html.includes('$85.00'));
  assert.ok(es.html.includes('cid:venmo-qr') && es.html.includes('cid:cashapp-qr'));
  assert.ok(es.html.includes('Congress Ave &lt;b&gt;1&lt;/b&gt;') && !es.html.includes('<b>1</b>'));
  assert.ok(es.html.includes('pagos@example.com'));
  assert.match(es.text, /Tarifa: \$85\.00/);
  assert.equal(es.attachments.length, 2);

  const en = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, qr);
  assert.match(en.subject, /Your ride is confirmed/);
  assert.ok(en.html.includes('See you soon, Ana.'));
  assert.ok(en.html.includes('9:30 AM'));

  const sinPago = buildConfirmationEmail(TRIP, '$85.00', {}, {});
  assert.ok(!sinPago.html.includes('Formas de pago') && !sinPago.html.includes('cid:'));
  assert.equal(sinPago.attachments.length, 0);
});

test('correo al chofer: botón de confirmación solo con enlace; sin QR (el chofer no paga)', async () => {
  const qr = await payQrs(PAY);
  const link = confirmUrl(ENV, TRIP);
  const full = buildEmail({ ...TRIP, phone: '737-529-1720', service: 'airport', ref: 'card' }, { pay: PAY, qr, confirmUrl: link, now: NOW });
  assert.ok(full.html.includes('Send confirmation with QR'));
  assert.ok(full.html.includes(link.replace(/&/g, '&amp;')));
  assert.ok(!full.html.includes('cid:'), 'el correo del chofer no lleva QR');
  assert.match(full.text, /api\/confirm\?t=/);
  assert.equal(full.attachments.length, 0);

  const plain = buildEmail({ ...TRIP, phone: '737-529-1720', service: 'airport', ref: 'card' }, { pay: PAY, now: NOW });
  assert.ok(!plain.html.includes('Send confirmation with QR'));
  assert.ok(plain.html.includes('Text payment details'), 'los botones anteriores siguen');
  assert.equal(plain.attachments.length, 0);
});

test('handleReservation: genera el enlace (sin QR) solo si hay correo, clave y sitio', async () => {
  let email;
  const send = async (_c, e) => ((email = e), true);
  const base = { phone: '737-529-1720', service: 'airport', date: '2099-01-10', time: '07:30', origin: 'A', destination: 'B', passengers: '2', notes: '', lang: 'en', ref: 'direct' };
  const ctx = (env) => ({ ip: ip(), serviceIds: ['airport'], now: NOW, send, env: { ...env, PAY_VENMO_URL: PAY.venmo, PAY_CASHAPP_URL: PAY.cashapp } });

  await handleReservation({ ...base, name: 'Ana', email: 'ana@example.com' }, ctx(ENV));
  assert.match(email.text, /\/api\/confirm\?t=/);
  assert.equal(email.attachments.length, 0);

  const noMail = await handleReservation({ ...base, name: 'Ana' }, ctx(ENV)); // el correo es obligatorio
  assert.equal(noMail.status, 422);

  await handleReservation({ ...base, name: 'Ana', email: 'ana@example.com' }, ctx({}));
  assert.ok(!/\/api\/confirm/.test(email.text), 'sin CONFIRM_SECRET no hay enlace');
});

test('handleConfirm GET: formulario con el resumen; enlace inválido o vencido → 410', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const ok = await handleConfirm({ method: 'GET', query: { t }, env: ENV, now: NOW });
  assert.equal(ok.status, 200);
  assert.ok(ok.html.includes('name="fare"') && ok.html.includes('Ana López') && ok.html.includes('ana@example.com'));
  assert.ok(ok.html.includes('Congress Ave &lt;b&gt;1&lt;/b&gt;') && !ok.html.includes('<b>1</b>'));
  assert.ok(!/<script/i.test(ok.html), 'sin JavaScript');

  const old = await handleConfirm({ method: 'GET', query: { t }, env: ENV, now: new Date(NOW.getTime() + 20 * 86400000) });
  assert.equal(old.status, 410);
  const junk = await handleConfirm({ method: 'GET', query: { t: 'basura' }, env: ENV, now: NOW });
  assert.equal(junk.status, 410);
  const noSecret = await handleConfirm({ method: 'GET', query: { t }, env: {}, now: NOW });
  assert.equal(noSecret.status, 503);
  const put = await handleConfirm({ method: 'PUT', env: ENV, now: NOW });
  assert.equal(put.status, 405);
});

test('handleConfirm POST: envía al pasajero con reply-to y BCC al chofer; tarifa inválida no envía', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const sent = [];
  const send = async (cfg, e) => (sent.push({ cfg, e }), true);
  const bad = await handleConfirm({ method: 'POST', body: { t, fare: 'mucho' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(bad.status, 422);
  assert.ok(bad.html.includes('role="alert"'));
  assert.equal(sent.length, 0);

  // Paso 1: vista previa con QR incrustados; todavía no se envía nada.
  const prev = await handleConfirm({ method: 'POST', body: { t, fare: '85' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(prev.status, 200);
  assert.equal(sent.length, 0, 'la vista previa no envía');
  assert.ok(prev.html.includes('<iframe') && prev.html.includes('srcdoc='));
  assert.ok(prev.html.includes('data:image/png;base64,') && !prev.html.includes('cid:'), 'QR visibles en la vista previa');
  assert.ok(prev.html.includes('$85.00') && prev.html.includes('name="send"'));

  // Paso 2: confirmar el envío.
  const ok = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(ok.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].cfg.to, 'ana@example.com');
  assert.equal(sent[0].cfg.bcc, 'chofer@example.com');
  assert.equal(sent[0].e.replyTo, 'chofer@example.com');
  assert.ok(sent[0].e.html.includes('$85.00'));
  assert.equal(sent[0].e.attachments.length, 2);

  const falla = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send: async () => false, pay: PAY });
  assert.equal(falla.status, 502);
  const lanza = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send: async () => { throw new Error('secreto interno'); }, pay: PAY });
  assert.equal(lanza.status, 502);
  assert.ok(!lanza.html.includes('secreto'));
});

test('handleConfirm POST: límite de intentos por IP', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const same = '203.0.113.9';
  const codes = [];
  for (let i = 0; i < 7; i++) {
    const r = await handleConfirm({ method: 'POST', body: { t, fare: 'x' }, env: ENV, now: NOW, ip: same, send: async () => true });
    codes.push(r.status);
  }
  assert.deepEqual(codes, [422, 422, 422, 422, 422, 429, 429]);
});

test('sendWithResend: adjuntos en línea y BCC solo cuando existen', async () => {
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_u, init) => (bodies.push(JSON.parse(init.body)), { ok: true });
  try {
    const att = [{ filename: 'venmo-qr.png', content: 'AAAA', content_type: 'image/png', content_id: 'venmo-qr' }];
    await sendWithResend({ apiKey: 'k', from: 'a@b.com', to: 'ana@example.com', bcc: 'chofer@example.com' }, { subject: 's', text: 't', html: 'h', attachments: att });
    await sendWithResend({ apiKey: 'k', from: 'a@b.com', to: 'ana@example.com' }, { subject: 's', text: 't', html: 'h' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(bodies[0].bcc, ['chofer@example.com']);
  assert.equal(bodies[0].attachments[0].content_id, 'venmo-qr');
  assert.ok(!('bcc' in bodies[1]) && !('attachments' in bodies[1]));
});

const fakeRes = () => {
  const r = { statusCode: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v);
  r.end = (b = '') => ((r.body = b), r);
  return r;
};

test('api/confirm: cabeceras de no indexar y sin caché; sin clave → 503; error inesperado → 500 genérico', async () => {
  const saved = { ...process.env };
  delete process.env.CONFIRM_SECRET;
  const res = fakeRes();
  await handler({ method: 'GET', url: '/api/confirm?t=x', headers: {} }, res);
  Object.assign(process.env, saved);
  assert.equal(res.statusCode, 503);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.match(res.headers['x-robots-tag'], /noindex/);

  const boom = fakeRes();
  const req = { method: 'GET' };
  Object.defineProperty(req, 'headers', { get() { throw new Error('detalle interno'); } });
  await handler(req, boom);
  assert.equal(boom.statusCode, 500);
  assert.ok(!boom.body.includes('detalle'));
});
