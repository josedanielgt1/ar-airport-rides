import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReservation, isSpam, escapeHtml, todayIn, shiftDate, LIMITS } from '../src/lib/validate.js';

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
