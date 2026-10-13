import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { sealToken } from '../src/lib/token.js';
import { buildConfirmationEmail, handleConfirm } from '../src/lib/confirm.js';
import { buildEmail, confirmationMessage } from '../src/lib/reservation.js';
import { cleanDriver, isDefaultVehicle, vehicleDefaults, vehicleFromForm, vehiclePhoto, VEHICLE_MAX } from '../src/lib/vehicle.js';
import { DRIVER_DEFAULT_NAME, EMAIL_VEHICLE_PHOTO, VEHICLE_DEFAULT } from '../src/config.js';

// Conductor editable ("Your chauffeur") y miniatura del vehículo solo con el vehículo predeterminado.
const SECRET = 'una-clave-larga-y-aleatoria-0123456789';
const NOW = new Date('2026-10-01T20:04:00Z');
const PAY = { venmo: 'https://venmo.com/u/ar-rides', cashapp: 'https://cash.app/$arrides', zelle: 'pagos@example.com' };
const TRIP = { name: 'Ana López', email: 'ana@example.com', lang: 'es', date: '2026-10-20', time: '09:30', origin: 'Congress Ave', destination: 'AUS', passengers: 2 };
const SITE = 'https://ejemplo.vercel.app';
const PHOTO_URL = `${SITE}${EMAIL_VEHICLE_PHOTO.path}`;
const ENV = {
  CONFIRM_SECRET: SECRET,
  SITE_URL: SITE,
  RESEND_API_KEY: 're_test',
  RESERVATION_FROM_EMAIL: 'AR <reservas@example.com>',
  RESERVATION_TO_EMAIL: 'chofer@example.com',
  VEHICLE_PLATE: 'TST1234',
};
let ipSeq = 0;
const ip = () => `10.9.0.${++ipSeq}`;
const unescapeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const inputValue = (html, name) => {
  const m = new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`).exec(html);
  return m ? unescapeAttr(m[1]) : null;
};
const previewEmail = (html) => unescapeAttr(/srcdoc="([^"]*)"/.exec(html)[1]);
const tokenEn = () => sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
const collector = () => {
  const sent = [];
  return { sent, send: async (_c, e) => (sent.push(e), true) };
};

test('conductor: por defecto "Abraham Rojas", DRIVER_NAME lo reemplaza y una variable inválida se ignora', () => {
  assert.equal(DRIVER_DEFAULT_NAME, 'Abraham Rojas');
  assert.equal(vehicleDefaults({}, 'en').driver, 'Abraham Rojas');
  assert.equal(vehicleDefaults({ DRIVER_NAME: '  José   Peña ' }, 'es').driver, 'José Peña');
  assert.equal(vehicleDefaults({ DRIVER_NAME: '<b>x</b>' }, 'en').driver, 'Abraham Rojas', 'inválida → default');
  assert.equal(vehicleDefaults({ DRIVER_NAME: '' }, 'en').driver, 'Abraham Rojas', 'vacía → default');
});

test('conductor: validación estricta (una línea, ≤ 60, letras con acentos/ñ, espacios y . \' -)', () => {
  assert.deepEqual(cleanDriver("  María-José O'Neill Jr. "), { value: "María-José O'Neill Jr." });
  assert.deepEqual(cleanDriver('Ñandú\nPérez'), { value: 'Ñandú Pérez' });
  assert.deepEqual(cleanDriver(''), { value: '' });
  assert.ok(cleanDriver('a'.repeat(VEHICLE_MAX.driver + 1)).error, 'demasiado largo');
  for (const bad of ['<script>', 'Ana "x"', 'Ana2', 'a=b', 'a;b', 'a&b', 'a/b']) assert.ok(cleanDriver(bad).error, bad);
  assert.deepEqual(vehicleFromForm({ driver: '' }, {}, 'en').vehicle.driver, '', 'vacío se respeta');
  assert.equal(vehicleFromForm({}, { DRIVER_NAME: 'Luis Gómez' }, 'en').vehicle.driver, 'Luis Gómez', 'ausente → default');
});

test('correo al pasajero: "Your chauffeur" / "Tu conductor" en el boleto y el texto plano; vacío omite la línea', () => {
  const v = { description: VEHICLE_DEFAULT.en, plate: 'TST 1234', driver: 'Abraham Rojas' };
  const en = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: v });
  assert.ok(en.html.includes('>Your chauffeur<') && en.html.includes('>Abraham Rojas<'));
  assert.match(en.text, /^Your ride: Black Ford Expedition XLT · Texas plate TST 1234\nYour chauffeur: Abraham Rojas$/m);
  assert.ok(!en.subject.includes('Abraham'));

  const es = buildConfirmationEmail(TRIP, '$85.00', PAY, {}, { vehicle: { ...v, description: VEHICLE_DEFAULT.es } });
  assert.ok(es.html.includes('>Tu conductor<'));
  assert.match(es.text, /^Tu conductor: Abraham Rojas$/m);

  const sin = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: { ...v, driver: '' } });
  assert.ok(!sin.html.includes('Your chauffeur') && !/chauffeur/i.test(sin.text));
  assert.ok(!/undefined|null/.test(sin.html + sin.text));

  // Solo conductor (sin vehículo ni placa): su línea aparece, la del vehículo no, y no hay foto.
  const solo = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: { description: '', plate: '', driver: 'Abraham Rojas' }, photo: vehiclePhoto(v, ENV, 'en') });
  assert.ok(solo.html.includes('>Your chauffeur<') && !solo.html.includes('>Your ride<') && !solo.html.includes('<img src="https://'));
  assert.match(solo.text, /^Your chauffeur: Abraham Rojas$/m);
  assert.ok(!/^Your ride:/m.test(solo.text));
});

test('escape: el nombre del conductor nunca llega crudo al correo', () => {
  const r = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', {}, {}, { vehicle: { description: '', plate: '', driver: '<img src=x onerror=alert(1)>' } });
  assert.ok(!r.html.includes('<img src=x'));
  assert.ok(r.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('página del chofer: campo Driver prellenado y editable; edición en vista previa, "Back to edit" y correo', async () => {
  const t = tokenEn();
  const get = await handleConfirm({ method: 'GET', query: { t }, env: ENV, now: NOW });
  assert.equal(inputValue(get.html, 'driver'), 'Abraham Rojas');
  assert.match(get.html, /name="driver"[^>]*maxlength="60"/);
  assert.ok(!/<script/i.test(get.html));
  const conEnv = await handleConfirm({ method: 'GET', query: { t }, env: { ...ENV, DRIVER_NAME: 'Luis Gómez' }, now: NOW });
  assert.equal(inputValue(conEnv.html, 'driver'), 'Luis Gómez');

  const { sent, send } = collector();
  const body = { t, fare: '85', vehicle: VEHICLE_DEFAULT.en, plate: 'TST 1234', driver: 'Carlos Peña' };
  const prev = await handleConfirm({ method: 'POST', body, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(prev.status, 200);
  assert.equal(sent.length, 0);
  assert.ok(previewEmail(prev.html).includes('Carlos Peña'));
  assert.ok(prev.html.includes('Driver: Carlos Peña'), 'resumen de la vista previa');
  assert.equal(inputValue(prev.html, 'driver'), 'Carlos Peña', 'viaja al envío y a "Back to edit"');

  const back = await handleConfirm({ method: 'POST', body: { ...body, edit: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(inputValue(back.html, 'driver'), 'Carlos Peña');
  assert.equal(sent.length, 0);

  const ok = await handleConfirm({ method: 'POST', body: { ...body, send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(ok.status, 200);
  assert.match(sent[0].text, /^Your chauffeur: Carlos Peña$/m);
  assert.ok(sent[0].html.includes('Carlos Peña') && !sent[0].html.includes('Abraham'));
});

test('validación del conductor en el servidor: 422 sin enviar y escapado en la página', async () => {
  const t = tokenEn();
  const { sent, send } = collector();
  const bad = await handleConfirm({ method: 'POST', body: { t, fare: '85', driver: '"><script>alert(1)</script>', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(bad.status, 422);
  assert.ok(bad.html.includes('role="alert"') && /Driver:/.test(bad.html));
  assert.ok(!/<script/i.test(bad.html));
  const largo = await handleConfirm({ method: 'POST', body: { t, fare: '85', driver: 'a'.repeat(61) }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(largo.status, 422);
  assert.equal(sent.length, 0);
});

test('miniatura: presente con el vehículo predeterminado (en/es, normalizado) y ausente si el chofer lo cambia', async () => {
  const t = tokenEn();
  const { sent, send } = collector();
  await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  const img = /<img src="([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]+)"/.exec(sent[0].html);
  assert.ok(img, 'hay miniatura');
  assert.deepEqual(img.slice(1), [PHOTO_URL, '120', '90', 'Black Ford Expedition XLT, front view']);
  assert.ok(!/display:\s*flex/.test(sent[0].html), 'sin flex');

  // Mayúsculas/espacios distintos siguen siendo el predeterminado; la placa no influye.
  await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: '  black   FORD expedition xlt ', plate: 'ZZZ 9999', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.ok(sent[1].html.includes(PHOTO_URL));

  // Otro vehículo → nunca la foto.
  await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'White Chevy Suburban', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.ok(!sent[2].html.includes(EMAIL_VEHICLE_PHOTO.path));
  await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: '', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.ok(!sent[3].html.includes(EMAIL_VEHICLE_PHOTO.path), 'vehículo vacío → sin foto');

  // Pasajero en español: predeterminado en español.
  const es = vehiclePhoto({ description: VEHICLE_DEFAULT.es }, ENV, 'es');
  assert.equal(es.alt, 'Ford Expedition XLT negra, vista frontal');
  assert.equal(vehiclePhoto({ description: VEHICLE_DEFAULT.en }, ENV, 'es'), null, 'la descripción en inglés no es la predeterminada del pasajero en español');
});

test('miniatura con VEHICLE_DESCRIPTION: solo si coincide con esa descripción', () => {
  const env = { ...ENV, VEHICLE_DESCRIPTION: 'Black Ford Expedition XLT 2023' };
  assert.ok(isDefaultVehicle({ description: 'black ford expedition xlt 2023' }, env, 'es'));
  assert.ok(vehiclePhoto({ description: 'Black Ford Expedition XLT 2023' }, env, 'en'));
  assert.equal(vehiclePhoto({ description: VEHICLE_DEFAULT.en }, env, 'en'), null);
  assert.equal(vehiclePhoto({ description: VEHICLE_DEFAULT.es }, env, 'es'), null);
});

test('miniatura: sin SITE_URL https válido no hay imagen (nunca una URL rota)', () => {
  const v = { description: VEHICLE_DEFAULT.en };
  for (const SITE_URL of [undefined, '', 'nota-url', 'http://ejemplo.com', 'http://localhost:3000', 'javascript:alert(1)']) {
    assert.equal(vehiclePhoto(v, { SITE_URL }, 'en'), null, String(SITE_URL));
  }
  assert.equal(vehiclePhoto(v, { VERCEL_PROJECT_PRODUCTION_URL: 'ar.vercel.app' }, 'en').src, 'https://ar.vercel.app/media/email-vehicle.jpg');
  const sinSitio = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: v, photo: vehiclePhoto(v, {}, 'en') });
  assert.ok(!sinSitio.html.includes('email-vehicle.jpg'));
});

test('vista previa: la miniatura se pide al mismo origen (CSP img-src \'self\'); el correo enviado lleva la URL absoluta', async () => {
  const t = tokenEn();
  const { send } = collector();
  const prev = await handleConfirm({ method: 'POST', body: { t, fare: '85' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  const shown = previewEmail(prev.html);
  assert.ok(shown.includes(`src="${EMAIL_VEHICLE_PHOTO.path}"`));
  assert.ok(!shown.includes(PHOTO_URL));
});

test('rechazar sigue igual: sin conductor ni miniatura', async () => {
  const t = tokenEn();
  const { sent, send } = collector();
  const r = await handleConfirm({ method: 'POST', body: { t, driver: '<x>', action: 'decline', send: '1' }, env: ENV, now: NOW, ip: ip(), send });
  assert.equal(r.status, 200);
  assert.ok(!sent[0].html.includes('chauffeur') && !sent[0].html.includes('email-vehicle') && !sent[0].html.includes('Abraham'));
});

test('idempotencia: cambiar el conductor tras enviar → 409 "Already sent"', async () => {
  const t = tokenEn();
  const seen = new Map();
  const send = async (_c, e) => {
    const prev = seen.get(e.idempotencyKey);
    if (prev === undefined) return seen.set(e.idempotencyKey, e.html), true;
    return prev === e.html ? true : { duplicate: true };
  };
  const a = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(a.status, 200);
  const again = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(again.status, 200, 'reenviar lo mismo no es un error');
  const b = await handleConfirm({ method: 'POST', body: { t, fare: '85', driver: 'Otro Nombre', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(b.status, 409);
  assert.match(b.html, /Already sent/);
});

test('correo al chofer: "Driver on file" discreto solo con botón Confirmar; nunca en el asunto', () => {
  const data = { ...TRIP, lang: 'en', phone: '737-529-1720', service: 'airport', ref: 'card' };
  const vehicle = vehicleDefaults(ENV, 'en');
  const con = buildEmail(data, { pay: PAY, now: NOW, confirmUrl: `${SITE}/api/confirm?t=x`, vehicle });
  assert.ok(con.html.includes('Driver on file: <span') && con.html.includes('>Abraham Rojas<') && con.html.includes('editable when you confirm'));
  assert.match(con.text, /^Vehicle on file: Black Ford Expedition XLT · Texas plate TST 1234 · Driver on file: Abraham Rojas \(you can change it before sending\)$/m);
  assert.ok(!con.subject.includes('Abraham'));
  const sin = buildEmail(data, { pay: PAY, now: NOW, vehicle });
  assert.ok(!sin.html.includes('Driver on file') && !sin.text.includes('Driver on file'));
  const esc = buildEmail(data, { pay: PAY, now: NOW, confirmUrl: `${SITE}/api/confirm?t=x`, vehicle: { ...vehicle, driver: '<b>x</b>' } });
  assert.ok(!esc.html.includes('<b>x</b>') && esc.html.includes('&lt;b&gt;x&lt;/b&gt;'));
  // El mensaje manual (mailto/SMS, sin vehículo) no cambia.
  assert.ok(!/chauffeur/i.test(confirmationMessage(data, PAY).body));
});

test('peso: el correo de confirmación sigue muy por debajo del recorte de Gmail (102 KB)', () => {
  const v = vehicleDefaults(ENV, 'es');
  const r = buildConfirmationEmail(TRIP, '$85.00', PAY, {}, { vehicle: v, photo: vehiclePhoto(v, ENV, 'es'), mapKey: 'AIzaTEST' });
  assert.ok(Buffer.byteLength(r.html) < 100 * 1024, `${Buffer.byteLength(r.html)} bytes`);
});

test('archivo de la miniatura: JPEG 240×180, ≤ 15 KB y sin EXIF', () => {
  const file = new URL(`../public${EMAIL_VEHICLE_PHOTO.path}`, import.meta.url);
  const buf = readFileSync(file);
  assert.ok(statSync(file).size <= 15 * 1024, `${statSync(file).size} bytes`);
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'JPEG');
  assert.ok(!buf.includes(Buffer.from('Exif\0\0', 'latin1')), 'sin EXIF');
  // Busca el marcador SOF0/SOF2 para leer el tamaño.
  let size = null;
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + len;
  }
  assert.deepEqual(size, { w: EMAIL_VEHICLE_PHOTO.width * 2, h: EMAIL_VEHICLE_PHOTO.height * 2 });
});
