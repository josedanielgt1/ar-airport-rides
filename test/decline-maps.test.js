import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealToken, confirmUrl } from '../src/lib/token.js';
import { buildConfirmationEmail, buildDeclineEmail, handleConfirm } from '../src/lib/confirm.js';
import { buildEmail } from '../src/lib/reservation.js';
import { mapsRouteUrl, mapsSearchUrl, staticMapUrl } from '../src/lib/maps.js';

const SECRET = 'una-clave-larga-y-aleatoria-0123456789';
const NOW = new Date('2026-10-01T20:04:00Z');
const PAY = { venmo: 'https://venmo.com/u/ar-rides', zelle: 'pagos@example.com' };
const TRIP = {
  name: 'Ana López',
  email: 'ana@example.com',
  lang: 'es',
  date: '2026-10-20',
  time: '09:30',
  origin: 'Hotel <b>Driskill</b>, Austin',
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
let n = 0;
const ip = () => `10.2.0.${++n}`;
const KEY = 'AIzaSyA-1234567890abcdefghijklmnopqrstu';

test('maps: enlaces codificados y mapa estático solo con clave válida', () => {
  assert.equal(mapsSearchUrl('A & B'), 'https://www.google.com/maps/search/?api=1&query=A%20%26%20B');
  assert.match(mapsRouteUrl('Hotel X', 'AUS'), /origin=Hotel%20X&destination=AUS&travelmode=driving$/);
  assert.equal(staticMapUrl('A', 'B', undefined), null);
  assert.equal(staticMapUrl('A', 'B', 'corta'), null);
  const url = staticMapUrl('Hotel X', 'AUS', KEY);
  assert.ok(url.startsWith('https://maps.googleapis.com/maps/api/staticmap?'));
  assert.ok(url.includes('label%3AA') && url.includes('label%3AB') && url.includes(`key=${KEY}`));
});

test('correo al pasajero: botones de mapa siempre; imagen solo con clave; todo escapado', () => {
  const sin = buildConfirmationEmail(TRIP, '$85.00', PAY, {});
  assert.ok(sin.html.includes('Ver ruta') && sin.html.includes('Ver recogida') && sin.html.includes('Ver destino'));
  assert.ok(sin.html.includes('google.com/maps/dir/'));
  assert.ok(!sin.html.includes('maps.googleapis.com'), 'sin clave no hay imagen');
  assert.ok(!sin.html.includes('<b>Driskill</b>'), 'dirección escapada');

  const con = buildConfirmationEmail({ ...TRIP, lang: 'en' }, '$85.00', PAY, {}, { mapKey: KEY });
  assert.ok(con.html.includes('maps.googleapis.com/maps/api/staticmap'));
  assert.ok(con.html.includes('Open route') && con.html.includes('Map of your route'));
});

test('correo de rechazo: es/en, con enlace al sitio, escapado y sin QR ni tarifa', () => {
  const es = buildDeclineEmail(TRIP, 'https://ejemplo.vercel.app');
  assert.match(es.subject, /Sobre tu solicitud/);
  assert.ok(es.html.includes('Elegir otra fecha') && es.html.includes('https://ejemplo.vercel.app'));
  assert.ok(es.text.includes('https://ejemplo.vercel.app'));
  assert.ok(!es.html.includes('<b>Driskill</b>') && !es.html.includes('cid:'));

  const en = buildDeclineEmail({ ...TRIP, lang: 'en' }, '');
  assert.match(en.subject, /About your ride request/);
  assert.ok(!en.html.includes('Choose another time'), 'sin URL del sitio no hay botón');
});

test('correo al chofer: botón de rechazo y ruta', () => {
  const link = confirmUrl(ENV, TRIP);
  const mail = buildEmail({ ...TRIP, phone: '737-529-1720', service: 'airport', ref: 'card' }, { pay: PAY, confirmUrl: link, now: NOW });
  assert.ok(mail.html.includes('Decline and ask to reschedule'));
  assert.ok(mail.html.includes('a=decline'));
  assert.ok(mail.html.includes('Open route in Maps'));
  assert.match(mail.text, /a=decline/);
  const plain = buildEmail({ ...TRIP, phone: '737-529-1720', service: 'airport', ref: 'card' }, { pay: PAY, now: NOW });
  assert.ok(!plain.html.includes('Decline and ask'));
});

test('handleConfirm: rechazo con vista previa y envío en dos pasos', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const sent = [];
  const send = async (cfg, e) => (sent.push({ cfg, e }), true);

  const get = await handleConfirm({ method: 'GET', query: { t, a: 'decline' }, env: ENV, now: NOW });
  assert.equal(get.status, 200);
  assert.ok(get.html.includes('srcdoc=') && get.html.includes('Send decline note') && get.html.includes('value="decline"'));

  const form = await handleConfirm({ method: 'GET', query: { t }, env: ENV, now: NOW });
  assert.ok(form.html.includes('name="action" value="decline"') && form.html.includes('formnovalidate'));

  const prev = await handleConfirm({ method: 'POST', body: { t, action: 'decline' }, env: ENV, now: NOW, ip: ip(), send });
  assert.equal(prev.status, 200);
  assert.equal(sent.length, 0, 'la vista previa no envía');

  const ok = await handleConfirm({ method: 'POST', body: { t, action: 'decline', send: '1' }, env: ENV, now: NOW, ip: ip(), send });
  assert.equal(ok.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].cfg.to, 'ana@example.com');
  assert.equal(sent[0].cfg.bcc, 'chofer@example.com');
  assert.equal(sent[0].e.replyTo, 'chofer@example.com');
  assert.match(sent[0].e.subject, /Sobre tu solicitud/);
  assert.ok(sent[0].e.html.includes('https://ejemplo.vercel.app'));

  const falla = await handleConfirm({ method: 'POST', body: { t, action: 'decline', send: '1' }, env: ENV, now: NOW, ip: ip(), send: async () => false });
  assert.equal(falla.status, 502);
  const sinClave = await handleConfirm({ method: 'POST', body: { t, action: 'decline', send: '1' }, env: { CONFIRM_SECRET: SECRET }, now: NOW, ip: ip(), send });
  assert.equal(sinClave.status, 503);
});

test('handleConfirm: la clave de Google Maps llega al correo del pasajero', async () => {
  const t = sealToken(TRIP, SECRET, NOW.getTime());
  const sent = [];
  const r = await handleConfirm({ method: 'POST', body: { t, fare: '85', send: '1' }, env: { ...ENV, GOOGLE_MAPS_API_KEY: KEY }, now: NOW, ip: ip(), send: async (c, e) => (sent.push(e), true), pay: PAY });
  assert.equal(r.status, 200);
  assert.ok(sent[0].html.includes('maps.googleapis.com'));
});
