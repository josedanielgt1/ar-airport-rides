import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealToken } from '../src/lib/token.js';
import { buildConfirmationEmail, handleConfirm, idempotencyKeyFor } from '../src/lib/confirm.js';
import { buildEmail, confirmationMessage } from '../src/lib/reservation.js';
import { cleanDescription, cleanPlate, vehicleDefaults, vehicleFromForm, vehicleText, VEHICLE_MAX } from '../src/lib/vehicle.js';
import { VEHICLE_DEFAULT } from '../src/config.js';

// Placa de EJEMPLO: la real vive solo en la variable de entorno VEHICLE_PLATE (nunca en el repo).
const PLATE = 'TST1234';
const SECRET = 'una-clave-larga-y-aleatoria-0123456789';
const NOW = new Date('2026-10-01T20:04:00Z');
const PAY = { venmo: 'https://venmo.com/u/ar-rides', cashapp: 'https://cash.app/$arrides', zelle: 'pagos@example.com' };
const TRIP = { name: 'Ana López', email: 'ana@example.com', lang: 'es', date: '2026-10-20', time: '09:30', origin: 'Congress Ave', destination: 'AUS', passengers: 2 };
const ENV = {
  CONFIRM_SECRET: SECRET,
  SITE_URL: 'https://ejemplo.vercel.app',
  RESEND_API_KEY: 're_test',
  RESERVATION_FROM_EMAIL: 'AR <reservas@example.com>',
  RESERVATION_TO_EMAIL: 'chofer@example.com',
  VEHICLE_PLATE: PLATE,
};
let ipSeq = 0;
const ip = () => `10.7.0.${++ipSeq}`;
const unescapeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** Valor de un <input name=…> en el HTML (o null). */
const inputValue = (html, name) => {
  const m = new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`).exec(html);
  return m ? unescapeAttr(m[1]) : null;
};
/** HTML del correo dentro del iframe de la vista previa. */
const previewEmail = (html) => unescapeAttr(/srcdoc="([^"]*)"/.exec(html)[1]);

test('limpieza: placa en mayúsculas con espacio, una línea, límites y caracteres seguros', () => {
  assert.deepEqual(cleanPlate('tst1234'), { value: 'TST 1234' });
  assert.deepEqual(cleanPlate('  abc - 123 '), { value: 'ABC-123' });
  assert.deepEqual(cleanPlate(''), { value: '' });
  assert.ok(cleanPlate('A'.repeat(VEHICLE_MAX.plate + 1)).error, 'placa demasiado larga');
  assert.ok(cleanPlate('<b>1').error, 'sin HTML en la placa');

  assert.deepEqual(cleanDescription('  Black   Ford\nExpedition ' + String.fromCharCode(0x2028) + 'XLT '), { value: 'Black Ford Expedition XLT' });
  assert.deepEqual(cleanDescription('Camioneta Ñandú 4x4 (negra), #2'), { value: 'Camioneta Ñandú 4x4 (negra), #2' });
  assert.ok(cleanDescription('x'.repeat(VEHICLE_MAX.description + 1)).error, 'descripción demasiado larga');
  for (const bad of ['<script>alert(1)</script>', 'a"b', 'a=b', 'a;b', 'x{y}']) assert.ok(cleanDescription(bad).error, bad);
});

test('valores por defecto: descripción de config en el idioma del pasajero y placa solo del entorno', () => {
  assert.deepEqual(vehicleDefaults({}, 'en'), { description: VEHICLE_DEFAULT.en, plate: '', driver: 'Abraham Rojas' }, 'sin VEHICLE_PLATE no hay placa');
  assert.deepEqual(vehicleDefaults({ VEHICLE_PLATE: PLATE }, 'es'), { description: 'Ford Expedition XLT negra', plate: 'TST 1234', driver: 'Abraham Rojas' });
  assert.equal(vehicleDefaults({ VEHICLE_DESCRIPTION: 'White Chevy Suburban' }, 'es').description, 'White Chevy Suburban', 'VEHICLE_DESCRIPTION pisa el default');
  assert.equal(vehicleDefaults({ VEHICLE_DESCRIPTION: '<b>x</b>' }, 'en').description, VEHICLE_DEFAULT.en, 'variable inválida se ignora');
  assert.equal(vehicleDefaults({ VEHICLE_PLATE: '<script>' }, 'en').plate, '', 'placa inválida se ignora');

  assert.equal(vehicleText({ description: 'Black Ford Expedition XLT', plate: 'TST 1234' }, 'en'), 'Black Ford Expedition XLT · Texas plate TST 1234');
  assert.equal(vehicleText({ description: 'Ford Expedition XLT negra', plate: 'TST 1234' }, 'es'), 'Ford Expedition XLT negra · placa de Texas TST 1234');
  assert.equal(vehicleText({ description: 'Black Ford Expedition XLT', plate: '' }, 'en'), 'Black Ford Expedition XLT');
  assert.equal(vehicleText({ description: '', plate: '' }, 'en'), '');

  assert.deepEqual(vehicleFromForm({}, { VEHICLE_PLATE: PLATE }, 'en').vehicle, { description: VEHICLE_DEFAULT.en, plate: 'TST 1234', driver: 'Abraham Rojas' }, 'campo ausente → default');
  assert.deepEqual(vehicleFromForm({ vehicle: '', plate: '', driver: '' }, { VEHICLE_PLATE: PLATE }, 'en').vehicle, { description: '', plate: '', driver: '' }, 'campo vacío → se respeta');
});

test('correo al pasajero: línea "Your ride" en el boleto y en el texto plano, en ambos idiomas', () => {
  const v = { description: 'Black Ford Expedition XLT', plate: 'TST 1234' };
  const en = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: v });
  assert.ok(en.html.includes('>Your ride<') && en.html.includes('Black Ford Expedition XLT') && en.html.includes('Texas plate') && en.html.includes('TST 1234'));
  assert.match(en.text, /^Your ride: Black Ford Expedition XLT · Texas plate TST 1234$/m);
  assert.ok(!en.subject.includes('TST'), 'la placa nunca va en el asunto');

  const es = buildConfirmationEmail(TRIP, '$85.00', PAY, {}, { vehicle: { description: 'Ford Expedition XLT negra', plate: 'TST 1234' } });
  assert.ok(es.html.includes('Tu vehículo') && es.html.includes('placa de Texas'));
  assert.match(es.text, /^Tu vehículo: Ford Expedition XLT negra · placa de Texas TST 1234$/m);

  const soloAuto = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: { description: 'Black Ford Expedition XLT', plate: '' } });
  assert.ok(!soloAuto.html.includes('Texas plate') && soloAuto.html.includes('Black Ford Expedition XLT'));
  assert.match(soloAuto.text, /^Your ride: Black Ford Expedition XLT$/m);

  for (const vacio of [undefined, { description: '', plate: '' }]) {
    const sin = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { vehicle: vacio });
    assert.ok(!sin.html.includes('>Your ride<') && !/^Your ride:/m.test(sin.text), 'sin vehículo no hay línea');
    assert.ok(!/undefined|null/.test(sin.html + sin.text));
  }
});

test('escape: HTML en la descripción nunca llega crudo al correo', () => {
  const r = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', {}, {}, { vehicle: { description: '<script>alert(1)</script>', plate: '<b>' } });
  assert.ok(!r.html.includes('<script>alert') && !r.html.includes('<b>'));
  assert.ok(r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('página del chofer: vehículo y placa prellenados (placa del entorno) y editables', async () => {
  const t = sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
  const r = await handleConfirm({ method: 'GET', query: { t }, env: ENV, now: NOW });
  assert.equal(r.status, 200);
  assert.equal(inputValue(r.html, 'vehicle'), 'Black Ford Expedition XLT');
  assert.equal(inputValue(r.html, 'plate'), 'TST 1234');
  assert.match(r.html, /name="vehicle"[^>]*maxlength="60"/);
  assert.match(r.html, /name="plate"[^>]*maxlength="12"/);
  assert.ok(!/<script/i.test(r.html), 'sigue sin JavaScript');

  const es = await handleConfirm({ method: 'GET', query: { t: sealToken(TRIP, SECRET, NOW.getTime()) }, env: { ...ENV, VEHICLE_PLATE: '' }, now: NOW });
  assert.equal(inputValue(es.html, 'vehicle'), 'Ford Expedition XLT negra', 'en el idioma del pasajero');
  assert.equal(inputValue(es.html, 'plate'), '', 'sin VEHICLE_PLATE el campo queda vacío');
});

test('edición: lo que escribe el chofer sale en la vista previa y en el correo enviado', async () => {
  const t = sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
  const sent = [];
  const send = async (_c, e) => (sent.push(e), true);
  const body = { t, fare: '85', vehicle: 'White Chevy Suburban', plate: 'xyz9876' };

  const prev = await handleConfirm({ method: 'POST', body, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(prev.status, 200);
  assert.equal(sent.length, 0, 'la vista previa no envía');
  const shown = previewEmail(prev.html);
  assert.ok(shown.includes('White Chevy Suburban') && shown.includes('XYZ 9876') && !shown.includes('Expedition'));
  assert.ok(prev.html.includes('Vehicle: White Chevy Suburban · Texas plate XYZ 9876'), 'resumen sobre la vista previa');
  // El formulario de envío lleva los valores ya limpios; el de "Back to edit" también.
  assert.equal(inputValue(prev.html, 'plate'), 'XYZ 9876');
  assert.ok(prev.html.includes('Back to edit'));

  const back = await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'White Chevy Suburban', plate: 'XYZ 9876', edit: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(back.status, 200);
  assert.equal(inputValue(back.html, 'vehicle'), 'White Chevy Suburban', 'volver a editar conserva lo escrito');
  assert.equal(inputValue(back.html, 'fare'), '85');
  assert.equal(sent.length, 0);

  const ok = await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'White Chevy Suburban', plate: 'XYZ 9876', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(ok.status, 200);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].html.includes('White Chevy Suburban') && sent[0].html.includes('XYZ 9876'));
  assert.match(sent[0].text, /^Your ride: White Chevy Suburban · Texas plate XYZ 9876$/m);
  assert.equal(sent[0].idempotencyKey, idempotencyKeyFor(t), 'la clave sigue siendo la del enlace');
  assert.ok(!sent[0].subject.includes('XYZ'));
});

test('campos vaciados: la línea (o la placa) se omite; nunca "undefined"', async () => {
  const t = sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
  const sent = [];
  const send = async (_c, e) => (sent.push(e), true);
  await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: '', plate: '', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.ok(!sent[0].html.includes('>Your ride<') && !/^Your ride:/m.test(sent[0].text));
  assert.ok(!/undefined/.test(sent[0].html + sent[0].text));

  await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'Black Ford Expedition XLT', plate: '  ', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.match(sent[1].text, /^Your ride: Black Ford Expedition XLT$/m);
  assert.ok(!sent[1].html.includes('Texas plate'));
});

test('validación en el servidor: HTML o exceso de longitud → 422 sin enviar, con el valor escapado', async () => {
  const t = sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
  const sent = [];
  const send = async (_c, e) => (sent.push(e), true);
  const xss = await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: '"><script>alert(1)</script>', plate: 'TST1234', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(xss.status, 422);
  assert.ok(xss.html.includes('role="alert"'));
  assert.ok(!/<script/i.test(xss.html), 'nada de HTML crudo en la página');
  assert.equal(sent.length, 0);

  const largo = await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'x'.repeat(61), plate: '' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(largo.status, 422);
  const placa = await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'Car', plate: 'A'.repeat(13) }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(placa.status, 422);
  assert.equal(sent.length, 0);
});

test('rechazar y reagendar no usa el vehículo y sigue funcionando', async () => {
  const t = sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
  const sent = [];
  const send = async (_c, e) => (sent.push(e), true);
  // Aunque el formulario mande los campos del vehículo (incluso inválidos), el rechazo los ignora.
  const r = await handleConfirm({ method: 'POST', body: { t, fare: '', vehicle: '<x>', plate: '!!', action: 'decline', send: '1' }, env: ENV, now: NOW, ip: ip(), send });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].html.includes('>Your ride<') && !sent[0].html.includes('TST'));
});

test('idempotencia: cambiar el vehículo tras enviar no manda un segundo correo (409 → Already sent)', async () => {
  const t = sealToken({ ...TRIP, lang: 'en' }, SECRET, NOW.getTime());
  const seen = new Map();
  // Simula Resend: misma clave + mismo cuerpo = repetición aceptada; misma clave + otro cuerpo = 409.
  const send = async (_c, e) => {
    const prev = seen.get(e.idempotencyKey);
    if (prev === undefined) return seen.set(e.idempotencyKey, e.html), true;
    return prev === e.html ? true : { duplicate: true };
  };
  const a = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(a.status, 200);
  const b = await handleConfirm({ method: 'POST', body: { t, fare: '85', vehicle: 'Other car', plate: 'ZZZ 1111', send: '1' }, env: ENV, now: NOW, ip: ip(), send, pay: PAY });
  assert.equal(b.status, 409);
  assert.match(b.html, /Already sent/);
});

test('correo al chofer: "Vehicle on file" discreto solo con enlace de confirmar; nunca en el asunto', () => {
  const data = { ...TRIP, lang: 'en', phone: '737-529-1720', service: 'airport', ref: 'card' };
  const vehicle = { description: 'Black Ford Expedition XLT', plate: 'TST 1234' };
  const conEnlace = buildEmail(data, { pay: PAY, now: NOW, confirmUrl: 'https://ejemplo.vercel.app/api/confirm?t=x', vehicle });
  assert.ok(conEnlace.html.includes('Vehicle on file:') && conEnlace.html.includes('Black Ford Expedition XLT · Texas plate TST 1234'));
  assert.match(conEnlace.text, /Vehicle on file: Black Ford Expedition XLT · Texas plate TST 1234/);
  assert.ok(!conEnlace.subject.includes('TST') && !conEnlace.subject.includes('Expedition'));

  const sinEnlace = buildEmail(data, { pay: PAY, now: NOW, vehicle });
  assert.ok(!sinEnlace.html.includes('Vehicle on file'));
  // El mensaje manual (mailto/SMS) sin vehículo queda como antes.
  assert.ok(!/^Your ride:/m.test(confirmationMessage(data, PAY).body));
});
