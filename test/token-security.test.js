/*
  Seguridad del enlace de confirmar (auditoría SEC-03, SEC-07, SEC-16, SEC-17):
  vigencia, manipulación, rotación de clave, secreto corto, un correo por enlace y cabeceras de /api/confirm.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import {
  sealToken,
  openToken,
  secretOk,
  secretStatus,
  secretsOf,
  confirmUrl,
  tokenId,
  weakSecretMessage,
  TOKEN_TTL_MS,
  MIN_SECRET,
} from '../src/lib/token.js';
import { handleConfirm, idempotencyKeyFor, sendPassengerEmail, sameOriginPost } from '../src/lib/confirm.js';
import { handleReservation } from '../src/lib/reservation.js';
import handler from '../api/confirm.js';

const SECRET = 'nueva-clave-aleatoria-de-32-o-mas-caracteres-01';
const OLD = 'clave-anterior-tambien-larga-0123456789abcdef';
const SHORT = 'solo-veinte-caracte'; // 19 caracteres (como un secreto heredado de 16-31)
const NOW = new Date('2026-10-01T20:04:00Z');
const H = 60 * 60 * 1000;
const TRIP = { name: 'Ana López', email: 'ana@example.com', lang: 'es', date: '2026-10-20', time: '09:30', origin: 'Congress Ave', destination: 'AUS', passengers: 2 };
const PAY = { venmo: 'https://venmo.com/u/ar-rides', cashapp: 'https://cash.app/$arrides' };
const ENV = {
  CONFIRM_SECRET: SECRET,
  SITE_URL: 'https://ejemplo.vercel.app',
  RESEND_API_KEY: 're_test',
  RESERVATION_FROM_EMAIL: 'AR <reservas@example.com>',
  RESERVATION_TO_EMAIL: 'chofer@example.com',
};
let n = 0;
const ip = () => `10.9.0.${++n}`;

/** Token con el formato ANTERIOR (sin byte de versión, clave = SHA-256, 14 días), como los que ya hay en el correo. */
function legacyToken(payload, secret, now, ttl = 14 * 24 * H) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...payload, exp: now + ttl }), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

test('vigencia: 24 h; vencido → null y 410', async () => {
  assert.equal(TOKEN_TTL_MS, 24 * H);
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  assert.equal(openToken(t, SECRET, NOW.getTime() + 23 * H)?.email, 'ana@example.com');
  assert.equal(openToken(t, SECRET, NOW.getTime() + 24 * H + 1), null, 'vencido');
  const r = await handleConfirm({ method: 'GET', query: { t }, env: ENV, now: new Date(NOW.getTime() + 25 * H) });
  assert.equal(r.status, 410);
});

test('manipulado: cualquier byte cambiado, versión cambiada o texto no canónico → null', () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const raw = Buffer.from(t, 'base64url');
  for (const i of [0, 1, 13, 29, raw.length - 1]) {
    const bad = Buffer.from(raw);
    bad[i] ^= 0x01;
    assert.equal(openToken(bad.toString('base64url'), SECRET, NOW.getTime()), null, `byte ${i}`);
  }
  assert.equal(openToken(`${t}=`, SECRET, NOW.getTime()), null, 'con relleno');
  assert.equal(openToken(`${t} `, SECRET, NOW.getTime()), null, 'con espacio');
  assert.equal(openToken(`${t}+`, SECRET, NOW.getTime()), null, 'caracteres de base64 normal');
  // Variante que decodifica a los mismos bytes (bits sobrantes del último carácter): no se acepta.
  const last = t.at(-1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const twins = [...alphabet].map((ch) => t.slice(0, -1) + ch).filter((v) => v !== t && Buffer.from(v, 'base64url').equals(raw));
  for (const v of twins) assert.equal(openToken(v, SECRET, NOW.getTime()), null, `gemelo ${v.at(-1)} de ${last}`);
  assert.equal(tokenId(`${t}=`), null);
});

test('otra clave no abre; con la clave anterior en CONFIRM_SECRET_PREVIOUS sí (rotación)', async () => {
  const viejo = sealToken(TRIP, OLD, NOW.getTime());
  assert.equal(openToken(viejo, SECRET, NOW.getTime()), null, 'otra clave');
  assert.equal(openToken(viejo, secretsOf(ENV), NOW.getTime()), null, 'sin PREVIOUS no abre');

  const rotando = { ...ENV, CONFIRM_SECRET_PREVIOUS: OLD };
  assert.deepEqual(secretsOf(rotando), [SECRET, OLD]);
  assert.equal(openToken(viejo, secretsOf(rotando), NOW.getTime())?.email, 'ana@example.com', 'abre con la anterior');
  const get = await handleConfirm({ method: 'GET', query: { t: viejo }, env: rotando, now: NOW });
  assert.equal(get.status, 200);

  // Los enlaces NUEVOS se cifran con la clave actual, no con la anterior.
  const nuevo = new URL(confirmUrl(rotando, TRIP, NOW.getTime())).searchParams.get('t');
  assert.ok(openToken(nuevo, SECRET, NOW.getTime()));
  assert.equal(openToken(nuevo, OLD, NOW.getTime()), null);

  // Una clave anterior corta se ignora (falla cerrado) y se avisa.
  const prevCorta = { ...ENV, CONFIRM_SECRET_PREVIOUS: SHORT };
  assert.deepEqual(secretsOf(prevCorta), [SECRET]);
  assert.match(weakSecretMessage(prevCorta), /CONFIRM_SECRET_PREVIOUS/);
});

test('formato anterior (sin versión): se abre solo durante 24 h desde que se emitió', () => {
  const t0 = NOW.getTime();
  const legacy = legacyToken(TRIP, SECRET, t0);
  assert.equal(openToken(legacy, SECRET, t0 + 2 * H)?.email, 'ana@example.com');
  assert.equal(openToken(legacy, SECRET, t0 + 25 * H), null, 'aunque decía 14 días, ahora vence a las 24 h');
  assert.equal(openToken(legacy, [SECRET, OLD], t0 + 2 * H)?.email, 'ana@example.com');
  assert.equal(openToken(legacyToken(TRIP, OLD, t0), [SECRET, OLD], t0 + 2 * H)?.email, 'ana@example.com', 'legado con la clave anterior');
});

test('secreto corto (< 32): falla cerrado sin romper las reservas', async () => {
  assert.equal(MIN_SECRET, 32);
  const corto = { ...ENV, CONFIRM_SECRET: SHORT };
  assert.equal(secretStatus(corto), 'short');
  assert.equal(secretOk(corto), false);
  assert.equal(secretOk({ CONFIRM_SECRET: 'x'.repeat(31) }), false);
  assert.equal(secretOk({ CONFIRM_SECRET: 'x'.repeat(32) }), true);
  assert.equal(secretStatus({}), 'missing');
  assert.throws(() => sealToken(TRIP, SHORT), /al menos 32/);
  assert.equal(openToken(sealToken(TRIP, SECRET), SHORT), null);
  assert.equal(confirmUrl(corto, TRIP), null, 'sin enlace');
  assert.match(weakSecretMessage(corto), /menos de 32 caracteres/);
  assert.ok(!weakSecretMessage(corto).includes(SHORT), 'el aviso no muestra la clave');
  assert.equal(weakSecretMessage(ENV), null);

  // La página explica que están desactivados (503).
  const r = await handleConfirm({ method: 'GET', query: { t: 'x' }, env: corto, now: NOW });
  assert.equal(r.status, 503);
  assert.match(r.html, /turned off until the site owner updates the security key/);

  // La reserva al chofer SIGUE enviándose, solo que sin el botón de confirmar.
  let email;
  const res = await handleReservation(
    { name: 'Ana', email: 'ana@example.com', phone: '737-529-1720', service: 'airport', date: '2099-01-10', time: '07:30', origin: 'A', destination: 'B', passengers: '2', notes: '', lang: 'en', ref: 'direct' },
    { ip: ip(), serviceIds: ['airport'], now: NOW, env: corto, send: async (_c, e) => ((email = e), true) },
  );
  assert.equal(res.status, 200);
  assert.ok(!/\/api\/confirm/.test(email.text));
});

test('un correo por enlace: mismo Idempotency-Key en envíos repetidos y entre confirmar/rechazar', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const keys = [];
  const send = async (_cfg, e) => (keys.push(e.idempotencyKey), true);
  const a = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  const b = await handleConfirm({ method: 'POST', body: { t, fare: '90', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  const c = await handleConfirm({ method: 'POST', body: { t, action: 'decline', send: '1' }, env: ENV, now: NOW, ip: ip(), send });
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
  assert.equal(keys.length, 3);
  assert.ok(keys.every((k) => k === keys[0]), 'misma clave');
  assert.match(keys[0], /^ar-confirm\/[0-9a-f]{64}$/);
  assert.ok(!keys[0].includes(t), 'la clave no contiene el token');
  assert.equal(idempotencyKeyFor(t), keys[0]);
  assert.match(a.html, /only one email/);

  // Otro enlace (aunque sea la misma reserva) → otra clave.
  assert.notEqual(idempotencyKeyFor(sealToken(TRIP, SECRET, NOW.getTime())), keys[0]);
  // El mismo enlace abierto con la clave anterior (rotación) conserva la clave.
  const viejo = sealToken(TRIP, OLD, NOW.getTime());
  const k2 = [];
  await handleConfirm({ method: 'POST', body: { t: viejo, fare: '85', send: '1' }, env: { ...ENV, CONFIRM_SECRET_PREVIOUS: OLD }, now: NOW, ip: ip(), send: async (_c, e) => (k2.push(e.idempotencyKey), true), pay: PAY });
  assert.equal(k2[0], idempotencyKeyFor(viejo));
});

test('repetido: Resend responde 409 → página "Already sent" (409) sin pretender que se envió', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  let first = true;
  const send = async () => (first ? ((first = false), true) : { duplicate: true });
  const ok = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(ok.status, 200);
  const dup = await handleConfirm({ method: 'POST', body: { t, fare: '10', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(dup.status, 409);
  assert.match(dup.html, /Already sent/);
  assert.match(dup.html, /nothing new was sent/);
  const dec = await handleConfirm({ method: 'POST', body: { t, action: 'decline', send: '1' }, env: ENV, now: NOW, ip: ip(), send });
  assert.equal(dec.status, 409);
});

test('sendPassengerEmail: manda Idempotency-Key a Resend y traduce 409', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  const statuses = [200, 409, 500];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const status = statuses.shift();
    return { ok: status < 300, status };
  };
  const errors = console.error;
  console.error = () => {};
  try {
    const cfg = { apiKey: 'k', from: 'a@b.com', to: 'ana@example.com', bcc: 'chofer@example.com' };
    const mail = { subject: 's', text: 't', html: 'h', idempotencyKey: 'ar-confirm/abc\r\nX: y' };
    assert.equal(await sendPassengerEmail(cfg, mail), true);
    assert.deepEqual(await sendPassengerEmail(cfg, mail), { duplicate: true });
    assert.equal(await sendPassengerEmail(cfg, mail), false);
  } finally {
    globalThis.fetch = realFetch;
    console.error = errors;
  }
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'ar-confirm/abc X: y', 'sin saltos de línea');
  assert.equal(calls[0].init.headers['Idempotency-Key'], calls[1].init.headers['Idempotency-Key']);
  assert.ok(!('idempotencyKey' in JSON.parse(calls[0].init.body)), 'la clave va en la cabecera, no en el cuerpo');
});

test('POST solo desde el mismo sitio (Sec-Fetch-Site / Origin)', async () => {
  assert.equal(sameOriginPost({ 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(sameOriginPost({ 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(sameOriginPost({ 'sec-fetch-site': 'same-site' }), false);
  assert.equal(sameOriginPost({ 'sec-fetch-site': 'none' }), false);
  assert.equal(sameOriginPost({ origin: 'https://evil.example', host: 'ejemplo.vercel.app' }), false);
  assert.equal(sameOriginPost({ origin: 'https://ejemplo.vercel.app', host: 'ejemplo.vercel.app' }), true);
  assert.equal(sameOriginPost({ origin: 'null' }), true, 'no-referrer hace que el navegador mande Origin: null');
  assert.equal(sameOriginPost({}), true, 'sin cabeceras (cliente sin navegador): el token sigue siendo obligatorio');

  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const sent = [];
  const send = async (_c, e) => (sent.push(e), true);
  const cross = await handleConfirm({ method: 'POST', headers: { 'sec-fetch-site': 'cross-site' }, body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(cross.status, 403);
  assert.equal(sent.length, 0);
  const same = await handleConfirm({ method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'null' }, body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(same.status, 200);
  assert.equal(sent.length, 1);
});

const fakeRes = () => {
  const r = { statusCode: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v);
  r.end = (b = '') => ((r.body = b), r);
  return r;
};

test('api/confirm: cabeceras de seguridad en TODAS las respuestas; 405 con Allow; el token no se refleja', async () => {
  const saved = process.env.CONFIRM_SECRET;
  process.env.CONFIRM_SECRET = SECRET;
  try {
    const t = sealToken(TRIP, SECRET, Date.now());
    const cases = [
      { method: 'GET', url: `/api/confirm?t=${t}`, headers: {} }, // 200
      { method: 'GET', url: '/api/confirm?t=basura-no-valida', headers: {} }, // 410
      { method: 'PUT', url: '/api/confirm', headers: {} }, // 405
      { method: 'OPTIONS', url: '/api/confirm', headers: {} }, // 405
      { method: 'POST', url: '/api/confirm', headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: { t, fare: '85', send: '1' } }, // 403
    ];
    const codes = [];
    for (const req of cases) {
      const res = fakeRes();
      await handler(req, res);
      codes.push(res.statusCode);
      assert.equal(res.headers['cache-control'], 'no-store', `${req.method} ${res.statusCode}`);
      assert.equal(res.headers['referrer-policy'], 'no-referrer');
      assert.match(res.headers['x-robots-tag'], /noindex/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
      assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
      assert.match(res.body, /<meta name="referrer" content="no-referrer">/);
      if (res.statusCode !== 200) assert.ok(!res.body.includes(t) && !res.body.includes('basura-no-valida'), 'el token no se refleja en errores');
      if (res.statusCode === 405) assert.equal(res.headers.allow, 'GET, POST');
    }
    assert.deepEqual(codes, [200, 410, 405, 405, 403]);

    // Con un secreto corto también lleva las cabeceras (503).
    process.env.CONFIRM_SECRET = SHORT;
    const warn = console.warn;
    console.warn = () => {};
    const res = fakeRes();
    try {
      await handler({ method: 'GET', url: `/api/confirm?t=${t}`, headers: {} }, res);
    } finally {
      console.warn = warn;
    }
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['cache-control'], 'no-store');
  } finally {
    if (saved === undefined) delete process.env.CONFIRM_SECRET;
    else process.env.CONFIRM_SECRET = saved;
  }
});
