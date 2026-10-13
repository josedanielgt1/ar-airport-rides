// Genera vistas previas de los correos en dist-email-preview/ (ignorado por git) para abrirlas en el navegador.
// Usa datos de EJEMPLO (nada real, nada se envía). Los QR en línea (cid:) se convierten a data: para verlos.
// Uso: npm run preview:emails
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildEmail } from '../src/lib/reservation.js';
import { buildConfirmationEmail } from '../src/lib/confirm.js';
import { payQrs } from '../src/lib/qr.js';
import { vehicleDefaults } from '../src/lib/vehicle.js';

const pay = {
  venmo: 'https://venmo.com/u/ejemplo',
  cashapp: 'https://cash.app/$ejemplo',
  zelle: 'pagos@ejemplo.com',
};
const qr = await payQrs(pay);
const inline = (html) =>
  html.replace(/cid:([\w-]+)/g, (m, id) => {
    const key = id.replace('-qr', '');
    return qr[key] ? `data:image/png;base64,${qr[key].toString('base64')}` : m;
  });

const trip = {
  name: 'Ana López',
  phone: '512-555-0100',
  email: 'ana@example.com',
  service: 'airport',
  date: '2026-10-20',
  time: '09:30',
  origin: 'Congress Ave, Austin TX',
  destination: 'Austin-Bergstrom Airport (AUS)',
  passengers: 2,
  notes: 'Two bags, one car seat.',
  lang: 'es',
  ref: 'card',
};

const out = new URL('../dist-email-preview/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, html) => writeFileSync(new URL(name, out), inline(html));

// Vehículo: descripción de src/config.js y placa SOLO de la variable VEHICLE_PLATE (si no está, sin placa).
//   PowerShell:  $env:VEHICLE_PLATE='ABC1234'; npm run preview:emails
const vehicleEs = vehicleDefaults(process.env, 'es');
const vehicleEn = vehicleDefaults(process.env, 'en');

const driver = buildEmail(trip, {
  serviceName: () => 'Airport (AUS)',
  pay,
  qr,
  confirmUrl: 'https://ejemplo.vercel.app/api/confirm?t=EJEMPLO',
  vehicle: vehicleEs,
});
write('chofer.html', driver.html);
write('pasajero-es.html', buildConfirmationEmail(trip, '$85.00', pay, qr, { vehicle: vehicleEs }).html);
write('pasajero-en.html', buildConfirmationEmail({ ...trip, lang: 'en', name: 'Ana Lopez' }, '$85.00', pay, qr, { vehicle: vehicleEn }).html);
console.log('Listo: dist-email-preview/chofer.html, pasajero-es.html, pasajero-en.html');
