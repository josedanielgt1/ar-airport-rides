/*
  Antiabuso de /api/reserve (SEC-02, SEC-08, SEC-12): origen, tipo de contenido, ráfagas, IP falsificada,
  límites por correo y teléfono, honeypot, tiempo mínimo, cuerpos enormes o anidados y cabeceras.
  Resend se simula reemplazando fetch: nunca sale nada a la red.
*/
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/reserve.js';
import {
  guards,
  resetGuards,
  clientIp,
  originAllowed,
  sameOriginRequest,
  emailKey,
  phoneKey,
  SlidingLimiter,
  LIMITS,
} from '../src/lib/ratelimit.js';

const TRIP_DATE = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

// Exactamente lo que arma src/form.js: Object.fromEntries(new FormData(form)) + lang + ref.
let seq = 0;
const formFields = (extra = {}) => {
  seq++;
  return {
    name: 'Ana López',
    phone: `(737) 555-${String(1000 + seq).slice(-4)}`,
    email: `ana${seq}@example.com`,
    service: 'airport',
    date: TRIP_DATE,
    time: '07:30',
    origin: 'Downtown Austin',
    destination: 'AUS',
    passengers: '2',
    notes: '',
    hp_trap: '',
    lang: 'es',
    ref: 'card',
    consent: 'yes',
    ...extra,
  };
};

// Cabeceras que manda un navegador real con el fetch de src/form.js desde el sitio.
const browserHeaders = (extra = {}) => ({
  host: 'arairportrides.com',
  origin: 'https://arairportrides.com',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  'content-type': 'application/json',
  accept: 'application/json',
  'x-form-elapsed': '42000',
  'x-real-ip': '203.0.113.10',
  ...extra,
});

const fakeRes = () => {
  const r = { statusCode: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v);
  r.end = (b = '') => ((r.body = b), r);
  return r;
};

const call = async ({ method = 'POST', headers = browserHeaders(), body = formFields() } = {}) => {
  const res = fakeRes();
  await handler({ method, headers, body }, res);
  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    /* sin cuerpo JSON (redirección) */
  }
  return { status: res.statusCode, headers: res.headers, json, raw: res.body };
};

let sent;
let savedEnv;
let savedFetch;
beforeEach(() => {
  resetGuards();
  sent = [];
  savedEnv = { ...process.env };
  savedFetch = globalThis.fetch;
  Object.assign(process.env, {
    RESEND_API_KEY: 're_test',
    RESERVATION_TO_EMAIL: 'driver@example.com',
    RESERVATION_FROM_EMAIL: 'AR Airport Rides <reservas@example.com>',
  });
  delete process.env.CONFIRM_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.ALLOWED_ORIGINS;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, 'https://api.resend.com/emails');
    sent.push(JSON.parse(opts.body));
    return { ok: true, status: 200 };
  };
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  globalThis.fetch = savedFetch;
});

/* ---------- Compatibilidad con el formulario real ---------- */

test('el fetch exacto de src/form.js reserva sin cambios visibles (200 { ok: true }, un correo al chofer)', async () => {
  const src = readFileSync(new URL('../src/form.js', import.meta.url), 'utf8');
  assert.match(src, /'Content-Type': 'application\/json'/, 'el formulario sigue mandando JSON');
  assert.match(src, /'X-Form-Elapsed'/, 'el formulario manda el tiempo de llenado');
  assert.match(src, /method: 'POST'/);

  const r = await call();
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['driver@example.com']);
  assert.equal(sent[0].reply_to, sent[0].reply_to.trim());
  assert.match(sent[0].reply_to, /^ana\d+@example\.com$/, 'Reply-To = un solo correo del pasajero');
  assert.ok(!/[\r\n]/.test(sent[0].subject));
});

test('también funciona con el cuerpo como texto JSON y con Content-Type con charset', async () => {
  const r = await call({
    headers: browserHeaders({ 'content-type': 'application/json; charset=UTF-8' }),
    body: JSON.stringify(formFields()),
  });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
});

test('una pestaña con la versión anterior del formulario (sin X-Form-Elapsed) sigue reservando', async () => {
  const h = browserHeaders();
  delete h['x-form-elapsed'];
  const r = await call({ headers: h });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1, 'no se descarta en silencio una reserva real');
});

test('formulario sin JS (urlencoded, mismo origen) → 303 a #reserve-sent', async () => {
  const r = await call({
    headers: browserHeaders({ 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-mode': 'navigate' }),
    body: new URLSearchParams(formFields()).toString(),
  });
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, '/#reserve-sent');
  assert.equal(sent.length, 1);
});

/* ---------- Origen (CSRF) ---------- */

test('origen cruzado rechazado: Sec-Fetch-Site cross-site / same-site → 403 genérico, sin correo', async () => {
  for (const site of ['cross-site', 'same-site', 'none']) {
    const r = await call({ headers: browserHeaders({ 'sec-fetch-site': site, origin: 'https://evil.example' }) });
    assert.equal(r.status, 403, site);
    assert.deepEqual(r.json, { ok: false, error: 'forbidden' });
  }
  assert.equal(sent.length, 0);
});

test('sin Sec-Fetch-Site (navegador viejo): Origin ajeno o "null" → 403', async () => {
  for (const origin of ['https://evil.example', 'null', 'https://arairportrides.com.evil.example', 'http://arairportrides.com']) {
    const h = browserHeaders({ origin });
    delete h['sec-fetch-site'];
    const r = await call({ headers: h });
    assert.equal(r.status, 403, origin);
  }
  assert.equal(sent.length, 0);
});

test('CSRF clásico con <form> urlencoded desde otro sitio → 303 a #reserve-error, sin correo', async () => {
  const body = new URLSearchParams(formFields()).toString();
  const cross = await call({
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'x-real-ip': '198.51.100.1' },
    body,
  });
  assert.equal(cross.status, 303);
  assert.equal(cross.headers.location, '/#reserve-error');
  // Sin ninguna prueba de origen (ni Sec-Fetch-Site, ni Origin, ni Referer) tampoco se acepta.
  const bare = await call({ headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '198.51.100.2' }, body });
  assert.equal(bare.headers.location, '/#reserve-error');
  // Con Referer del propio sitio (navegador sin Origin ni Sec-Fetch-Site) sí.
  const ref = await call({
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: 'https://www.arairportrides.com/?ref=card', 'x-real-ip': '198.51.100.3' },
    body: new URLSearchParams(formFields()).toString(),
  });
  assert.equal(ref.headers.location, '/#reserve-sent');
  assert.equal(sent.length, 1);
});

test('JSON sin Origin ni Sec-Fetch-Site (cliente fuera del navegador): se procesa y lo frenan los límites', async () => {
  const r = await call({ headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.9' } });
  assert.equal(r.status, 200);
});

test('lista de orígenes: producción, previews del proyecto (con Host igual) y localhost solo fuera de producción', () => {
  assert.ok(originAllowed('https://arairportrides.com'));
  assert.ok(originAllowed('https://www.arairportrides.com'));
  assert.ok(originAllowed('https://ar-airport-rides.vercel.app'));
  const preview = 'ar-airport-rides-git-sec-anti-abuso-abran.vercel.app';
  assert.ok(originAllowed(`https://${preview}`, { host: preview }));
  assert.ok(!originAllowed(`https://${preview}`, { host: 'arairportrides.com' }), 'preview ajena al Host');
  assert.ok(!originAllowed('https://ar-airport-rides-evil.vercel.app', { host: 'arairportrides.com' }));
  assert.ok(!originAllowed('https://evil.vercel.app', { host: 'evil.vercel.app' }), 'otro proyecto de vercel.app');
  assert.ok(originAllowed('https://abc123.vercel.app', { host: 'abc123.vercel.app', env: { VERCEL_URL: 'abc123.vercel.app' } }));
  assert.ok(originAllowed('http://localhost:5173', { env: {} }));
  assert.ok(!originAllowed('http://localhost:5173', { env: { VERCEL_ENV: 'production' } }));
  assert.ok(originAllowed('https://reservas.example', { env: { ALLOWED_ORIGINS: 'https://reservas.example/' } }));
  assert.ok(!originAllowed('null'));
  assert.ok(!originAllowed('javascript:alert(1)'));
});

test('sameOriginRequest: Sec-Fetch-Site manda sobre Origin', () => {
  assert.equal(sameOriginRequest({ headers: { 'sec-fetch-site': 'same-origin' } }, { json: true }), true);
  assert.equal(sameOriginRequest({ headers: { 'sec-fetch-site': 'cross-site', origin: 'https://arairportrides.com' } }, { json: true }), false);
});

/* ---------- Método y tipo de contenido ---------- */

test('método distinto de POST → 405 con Allow: POST', async () => {
  for (const method of ['GET', 'PUT', 'OPTIONS', 'HEAD']) {
    const r = await call({ method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.allow, 'POST');
  }
});

test('Content-Type incorrecto (text/plain, multipart, sin tipo) → 415, sin correo', async () => {
  for (const ct of ['text/plain', 'text/plain;charset=UTF-8', 'multipart/form-data; boundary=x', '', 'application/jsonp', 'application/json-patch+json']) {
    const r = await call({ headers: browserHeaders({ 'content-type': ct }), body: JSON.stringify(formFields()) });
    assert.equal(r.status, 415, ct || '(vacío)');
    assert.deepEqual(r.json, { ok: false, error: 'unsupported' });
  }
  assert.equal(sent.length, 0);
});

/* ---------- Ráfagas e IP ---------- */

test('ráfaga desde una IP: la 6.ª solicitud en 10 min → 429', async () => {
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await call({ headers: browserHeaders({ 'x-real-ip': '192.0.2.50' }) })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(sent.length, 5);
});

test('IP falsificada en X-Forwarded-For no esquiva el límite (solo cuenta la IP que pone Vercel)', async () => {
  const codes = [];
  for (let i = 0; i < 6; i++) {
    const h = browserHeaders({ 'x-real-ip': '192.0.2.77', 'x-forwarded-for': `10.9.9.${i}, 192.0.2.77` });
    codes.push((await call({ headers: h })).status);
  }
  assert.equal(codes.at(-1), 429);
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
  assert.equal(clientIp({ headers: { 'x-vercel-forwarded-for': '203.0.113.5', 'x-real-ip': '203.0.113.6' } }), '203.0.113.5');
  assert.equal(clientIp({ headers: { 'x-real-ip': 'not an ip<script>' } }), 'unknown');
});

test('las solicitudes inválidas y de bots también gastan el cupo de la IP', async () => {
  const ip = '192.0.2.88';
  for (let i = 0; i < 5; i++) await call({ headers: browserHeaders({ 'x-real-ip': ip }), body: formFields({ hp_trap: 'bot' }) });
  const r = await call({ headers: browserHeaders({ 'x-real-ip': ip }) });
  assert.equal(r.status, 429);
  assert.equal(sent.length, 0);
});

/* ---------- Límites por pasajero y tope global ---------- */

test('mismo correo repetido desde IP y teléfonos distintos: la 4.ª en una hora → 429', async () => {
  const codes = [];
  const emails = ['victima@gmail.com', 'Victima@Gmail.com', 'vic.tima+x@gmail.com', 'victima+promo@gmail.com'];
  for (let i = 0; i < 4; i++) {
    const r = await call({ headers: browserHeaders({ 'x-real-ip': `198.18.0.${i + 1}` }), body: formFields({ email: emails[i] }) });
    codes.push(r.status);
  }
  assert.deepEqual(codes, [200, 200, 200, 429]);
  assert.equal(sent.length, 3);
});

test('mismo teléfono con otro formato: la 4.ª en una hora → 429', async () => {
  const phones = ['737-555-0199', '(737) 555-0199', '+1 737 555 0199', '17375550199'];
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const r = await call({ headers: browserHeaders({ 'x-real-ip': `198.18.1.${i + 1}` }), body: formFields({ phone: phones[i] }) });
    codes.push(r.status);
  }
  assert.deepEqual(codes, [200, 200, 200, 429]);
});

test('tope global de la instancia: después de 20 envíos en una hora → 429 aunque cambien IP, correo y teléfono', async () => {
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await call({ headers: browserHeaders({ 'x-real-ip': `198.19.0.${i + 1}` }) })).status);
  assert.equal(codes.filter((c) => c === 200).length, LIMITS.global[0].max);
  assert.equal(codes.at(-1), 429);
});

test('claves normalizadas y limitador sin vaciado global (SEC-12)', () => {
  assert.equal(emailKey('J.Doe+tag@GMail.com'), 'jdoe@gmail.com');
  assert.equal(emailKey('a.b@example.com'), 'a.b@example.com');
  assert.equal(phoneKey('+1 (737) 529-1720'), '7375291720');
  assert.equal(phoneKey('12'), null);

  const l = new SlidingLimiter({ rules: [{ windowMs: 1000, max: 2 }], maxKeys: 3 });
  const t = 1_000_000;
  l.hit('a', t);
  l.hit('a', t + 1);
  for (const k of ['b', 'c', 'd', 'e']) l.hit(k, t + 2);
  assert.ok(l.size <= 3, 'acotado');
  // Con muchas claves nuevas no se borra todo: las recientes conservan su cuenta.
  l.hit('e', t + 3);
  assert.equal(l.hit('e', t + 4), true);
  assert.equal(l.wouldExceed('e', t + 2000), false, 'la ventana se libera');
  assert.equal(guards.global.maxKeys, 1);
});

/* ---------- Honeypot y tiempo mínimo ---------- */

test('honeypot y envío demasiado rápido: error VISIBLE (nunca éxito falso), sin correo', async () => {
  const real = await call({ headers: browserHeaders({ 'x-real-ip': '203.0.113.20' }) });
  assert.equal(real.status, 200);
  assert.equal(sent.length, 1);
  const hp = await call({ headers: browserHeaders({ 'x-real-ip': '203.0.113.21' }), body: formFields({ hp_trap: 'ACME' }) });
  const fast = await call({ headers: browserHeaders({ 'x-real-ip': '203.0.113.22', 'x-form-elapsed': '300' }) });
  const junk = await call({ headers: browserHeaders({ 'x-real-ip': '203.0.113.23', 'x-form-elapsed': 'abc' }) });
  for (const bot of [hp, fast, junk]) {
    assert.equal(bot.status, 400);
    assert.match(bot.raw, /"ok":false/);
    assert.match(bot.raw, /"error":"verify"/);
  }
  assert.equal(sent.length, 1, 'los bots no generan correo');

  // Un navegador que autorrellena "company" (campo que ya no existe) NO se confunde con un bot.
  const autofill = await call({ headers: browserHeaders({ 'x-real-ip': '203.0.113.25' }), body: formFields({ company: 'Mi Empresa' }) });
  assert.equal(autofill.status, 200);
  assert.equal(sent.length, 2);

  const noJs = await call({
    headers: browserHeaders({ 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '203.0.113.24' }),
    body: new URLSearchParams(formFields({ hp_trap: 'x' })).toString(),
  });
  assert.equal(noJs.headers.location, '/#reserve-error');
  assert.equal(sent.length, 2);
});

/* ---------- Cuerpos enormes o anidados ---------- */

test('JSON enorme → 413 antes de leer el cuerpo', async () => {
  let touched = false;
  const req = { method: 'POST', headers: browserHeaders({ 'content-length': String(5 * 1024 * 1024) }) };
  Object.defineProperty(req, 'body', { get: () => ((touched = true), {}) });
  const res = fakeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.equal(touched, false, 'no se parsea el cuerpo');

  const big = await call({ body: JSON.stringify({ ...formFields(), notes: 'x'.repeat(20000) }) });
  assert.equal(big.status, 413);
  assert.equal(sent.length, 0);
});

test('JSON anidado, arreglos, muchas claves o mal formado → 400 genérico', async () => {
  let nested = 'x';
  for (let i = 0; i < 500; i++) nested = { a: nested };
  const bodies = [
    { ...formFields(), name: { first: 'Ana' } },
    { ...formFields(), notes: ['a', 'b'] },
    { ...formFields(), deep: nested },
    [formFields()],
    Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'v'])),
    { ...formFields(), notes: 'y'.repeat(3000) },
  ];
  for (const [i, body] of bodies.entries()) {
    const r = await call({ headers: browserHeaders({ 'x-real-ip': `100.64.0.${i + 1}` }), body });
    assert.equal(r.status, 400);
    assert.deepEqual(r.json, { ok: false, error: 'invalid_request' });
  }
  // Vercel lanza al leer req.body si el JSON está roto.
  const req = { method: 'POST', headers: browserHeaders({ 'x-real-ip': '100.64.1.1' }) };
  Object.defineProperty(req, 'body', { get: () => { throw new SyntaxError('Invalid JSON'); } });
  const res = fakeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(sent.length, 0);
});

test('claves desconocidas se descartan (un campo nuevo del formulario no rompe las reservas)', async () => {
  const r = await call({ body: { ...formFields(), privacy: 'on', __proto__x: '1' } });
  assert.equal(r.status, 200);
});

/* ---------- Correo de terceros ---------- */

test('correo del pasajero: varios destinatarios, CRLF o desechable → 422, nunca llega a Resend', async () => {
  const bad = ['a@example.com,b@example.com', 'a@example.com;b@example.com', 'a@example.com\r\nBcc: x@example.com', 'a@mailinator.com', 'x@sub.yopmail.com', '"a b"@example.com'];
  for (const email of bad) {
    const r = await call({ headers: browserHeaders({ 'x-real-ip': `100.65.0.${seq}` }), body: formFields({ email }) });
    assert.equal(r.status, 422, email);
    assert.equal(r.json.errors.email, 'email');
  }
  assert.equal(sent.length, 0);
});

/* ---------- Cabeceras ---------- */

test('las respuestas de /api/reserve llevan Cache-Control: no-store y nosniff', async () => {
  for (const r of [await call(), await call({ method: 'GET' }), await call({ headers: browserHeaders({ 'content-type': 'text/plain' }) })]) {
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
});

test('vercel.json: HSTS con includeSubDomains (sin preload) y /api/* sin caché', () => {
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const all = cfg.headers.find((h) => h.source === '/(.*)').headers;
  const hsts = all.find((h) => h.key === 'Strict-Transport-Security')?.value ?? '';
  assert.match(hsts, /max-age=63072000/);
  assert.match(hsts, /includeSubDomains/);
  assert.doesNotMatch(hsts, /preload/);
  assert.ok(all.some((h) => h.key === 'X-Content-Type-Options' && h.value === 'nosniff'));
  const api = cfg.headers.find((h) => h.source === '/api/(.*)').headers;
  assert.ok(api.some((h) => h.key === 'Cache-Control' && h.value === 'no-store'));
});
