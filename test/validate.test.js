import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReservation,
  isSpam,
  escapeHtml,
  todayIn,
  shiftDate,
  LIMITS,
  isBlockedEmailDomain,
  DISPOSABLE_EMAIL_DOMAINS,
  filledTooFast,
  MIN_FILL_MS,
  plainInput,
} from '../src/lib/validate.js';

const IDS = ['city', 'airport', 'door', 'events', 'corporate', 'hourly'];
const TODAY = '2026-10-01';

const valid = () => ({
  name: '  Ana  López ',
  phone: '(737) 529-1720',
  service: 'airport',
  date: '2026-10-02',
  time: '07:30',
  origin: 'Downtown Austin',
  destination: 'AUS',
  passengers: '2',
  email: 'ana@example.com',
  notes: 'Two bags.\r\nFlight AA 123',
  lang: 'es',
  ref: 'card',
});

test('acepta una solicitud válida y sanea los textos', () => {
  const r = validateReservation(valid(), { serviceIds: IDS, today: TODAY });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.data.name, 'Ana López');
  assert.equal(r.data.passengers, 2);
  assert.equal(r.data.notes, 'Two bags.\nFlight AA 123');
  assert.equal(r.data.lang, 'es');
  assert.equal(r.data.ref, 'card');
});

test('marca los obligatorios vacíos', () => {
  const r = validateReservation({}, { serviceIds: IDS, today: TODAY });
  assert.equal(r.ok, false);
  for (const f of ['name', 'phone', 'date', 'time', 'origin', 'destination', 'passengers']) {
    assert.equal(r.errors[f], 'required', f);
  }
  assert.equal(r.errors.service, 'service');
  assert.equal(r.errors.notes, undefined, 'notas es opcional');
});

test('rechaza teléfonos inválidos', () => {
  for (const phone of ['123', 'call me', '+1 737 529 1720 0000000', '737<script>']) {
    const r = validateReservation({ ...valid(), phone }, { serviceIds: IDS, today: TODAY });
    assert.equal(r.errors.phone, 'phone', phone);
  }
});

test('rechaza servicios fuera de la lista', () => {
  const r = validateReservation({ ...valid(), service: 'helicopter' }, { serviceIds: IDS, today: TODAY });
  assert.equal(r.errors.service, 'service');
});

test('fecha: formato real y no anterior a hoy', () => {
  const past = validateReservation({ ...valid(), date: '2026-09-30' }, { today: TODAY });
  assert.equal(past.errors.date, 'date');
  const fake = validateReservation({ ...valid(), date: '2026-02-30' }, { today: TODAY });
  assert.equal(fake.errors.date, 'date');
  const same = validateReservation({ ...valid(), date: TODAY }, { today: TODAY });
  assert.equal(same.errors.date, undefined);
});

test('hora en formato HH:MM de 24 h', () => {
  assert.equal(validateReservation({ ...valid(), time: '25:00' }).errors.time, 'time');
  assert.equal(validateReservation({ ...valid(), time: '7pm' }).errors.time, 'time');
  assert.equal(validateReservation({ ...valid(), time: '23:59' }).errors.time, undefined);
});

test('pasajeros entre los límites', () => {
  assert.equal(validateReservation({ ...valid(), passengers: '0' }).errors.passengers, 'passengers');
  assert.equal(validateReservation({ ...valid(), passengers: String(LIMITS.passengersMax + 1) }).errors.passengers, 'passengers');
  assert.equal(validateReservation({ ...valid(), passengers: '2.5' }).errors.passengers, 'passengers');
  assert.equal(validateReservation({ ...valid(), passengers: String(LIMITS.passengersMax) }).errors.passengers, undefined);
});

test('límites de longitud', () => {
  const r = validateReservation({ ...valid(), notes: 'x'.repeat(LIMITS.notes + 1), origin: 'y'.repeat(LIMITS.place + 1) });
  assert.equal(r.errors.notes, 'tooLong');
  assert.equal(r.errors.origin, 'tooLong');
});

test('lang y ref solo aceptan valores cerrados', () => {
  const r = validateReservation({ ...valid(), lang: 'fr', ref: '<b>x</b>' });
  assert.equal(r.data.lang, 'en');
  assert.equal(r.data.ref, 'direct');
});

test('quita caracteres de control', () => {
  const r = validateReservation({ ...valid(), name: 'Ana\u0000\u0007 Ruiz' });
  assert.equal(r.data.name, 'Ana Ruiz');
});

test('honeypot', () => {
  assert.equal(isSpam({ company: '' }), false);
  assert.equal(isSpam({}), false);
  assert.equal(isSpam({ company: 'ACME' }), true);
});

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('fechas auxiliares', () => {
  assert.equal(todayIn('America/Chicago', new Date('2026-10-02T03:00:00Z')), '2026-10-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('correo del pasajero: obligatorio, con formato prudente y sin inyección de cabeceras', () => {
  const ok = validateReservation({ ...valid(), email: '  Ana.Lopez+rides@Example.com ' }, { serviceIds: IDS, today: TODAY });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.email, 'Ana.Lopez+rides@Example.com');

  const empty = validateReservation({ ...valid(), email: '' }, { serviceIds: IDS, today: TODAY });
  assert.equal(empty.ok, false);
  assert.equal(empty.errors.email, 'required');

  for (const email of ['x', 'a@b', 'a b@c.com', '<a@b.com>', 'a@b.com, c@d.com', 'ana@example.com\r\nBcc: v@x.com', `${'a'.repeat(130)}@example.com`]) {
    const r = validateReservation({ ...valid(), email }, { serviceIds: IDS, today: TODAY });
    assert.ok(r.errors.email, email);
  }
});

test('correo: un solo destinatario, sin puntos raros ni dominios mal formados', () => {
  const bad = [
    'a@example.com;b@example.com',
    'a@example.com b@example.com',
    '.ana@example.com',
    'ana.@example.com',
    'an..a@example.com',
    'ana@-example.com',
    'ana@example-.com',
    'ana@example..com',
    'ana@example.c0m',
    'ana@[127.0.0.1]',
    '"ana"@example.com',
    'ana@example.com\nBcc: x@example.com',
  ];
  for (const email of bad) {
    const r = validateReservation({ ...valid(), email }, { serviceIds: IDS, today: TODAY });
    assert.equal(r.errors.email, 'email', email);
  }
  for (const email of ['ana@example.com', 'o\'brien@example.co.uk'.replace("'", ''), 'a_b-c%d@sub.example.travel']) {
    const r = validateReservation({ ...valid(), email }, { serviceIds: IDS, today: TODAY });
    assert.equal(r.errors.email, undefined, email);
  }
});

test('correo desechable: lista pequeña y configurable (incluye subdominios)', () => {
  assert.ok(DISPOSABLE_EMAIL_DOMAINS.length > 5 && DISPOSABLE_EMAIL_DOMAINS.length < 50);
  assert.equal(isBlockedEmailDomain('x@mailinator.com'), true);
  assert.equal(isBlockedEmailDomain('x@eu.Mailinator.com'), true);
  assert.equal(isBlockedEmailDomain('x@notmailinator.com'), false);
  const r = validateReservation({ ...valid(), email: 'bot@yopmail.com' }, { serviceIds: IDS, today: TODAY });
  assert.equal(r.errors.email, 'email');
  const custom = validateReservation({ ...valid(), email: 'bot@yopmail.com' }, { serviceIds: IDS, today: TODAY, blockedEmailDomains: [] });
  assert.equal(custom.errors.email, undefined, 'la lista se puede vaciar o cambiar');
  const other = validateReservation({ ...valid(), email: 'a@spam.test' }, { serviceIds: IDS, today: TODAY, blockedEmailDomains: ['spam.test'] });
  assert.equal(other.errors.email, 'email');
});

test('quita caracteres invisibles y de control bidireccional (SEC-11)', () => {
  const rlo = String.fromCharCode(0x202e);
  const zw = String.fromCharCode(0x200b);
  const bom = String.fromCharCode(0xfeff);
  const iso = String.fromCharCode(0x2066);
  const r = validateReservation(
    { ...valid(), name: `Ana${zw} ${rlo}López${bom}`, origin: `${iso}Downtown Austin`, notes: `pay${rlo}gpj.exe` },
    { serviceIds: IDS, today: TODAY },
  );
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.data.name, 'Ana López');
  assert.equal(r.data.origin, 'Downtown Austin');
  assert.equal(r.data.notes, 'paygpj.exe');
});

test('tiempo mínimo de llenado: solo juzga si llega la cabecera', () => {
  assert.equal(filledTooFast(undefined), false, 'sin cabecera (sin JS o versión anterior): no se descarta');
  assert.equal(filledTooFast(''), false);
  assert.equal(filledTooFast('0'), true);
  assert.equal(filledTooFast(String(MIN_FILL_MS - 1)), true);
  assert.equal(filledTooFast(String(MIN_FILL_MS)), false);
  assert.equal(filledTooFast('600000'), false);
  assert.equal(filledTooFast('-5'), true);
  assert.equal(filledTooFast('1e9'), true);
});

test('plainInput: objeto plano con valores simples; anidados, arreglos o enormes → null', () => {
  assert.deepEqual(plainInput({ name: 'Ana', passengers: 2, ok: true, nada: null }), { name: 'Ana', passengers: '2', ok: 'true' });
  assert.equal(plainInput({ name: { a: 1 } }), null);
  assert.equal(plainInput({ name: ['a'] }), null);
  assert.equal(plainInput([]), null);
  assert.equal(plainInput('texto'), null);
  assert.equal(plainInput(null), null);
  assert.equal(plainInput({ notes: 'x'.repeat(2001) }), null);
  assert.equal(plainInput(Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, '1']))), null);
  assert.equal(plainInput(new Date()), null);
  const polluted = plainInput(JSON.parse('{"__proto__": "x", "name": "Ana"}'));
  assert.deepEqual(polluted, { name: 'Ana' });
  assert.equal(Object.getPrototypeOf(polluted), Object.prototype);
});