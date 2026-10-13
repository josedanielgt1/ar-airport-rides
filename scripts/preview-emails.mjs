// Genera vistas previas de los correos en dist-email-preview/ (ignorado por git) para abrirlas en el navegador.
// Usa datos de EJEMPLO (nada real, nada se envía). Los QR en línea (cid:) se convierten a data: para verlos.
// Uso: npm run preview:emails            (carpeta de salida opcional: $env:PREVIEW_OUT='demo-video/correo')
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildEmail } from '../src/lib/reservation.js';
import { buildConfirmationEmail } from '../src/lib/confirm.js';
import { payQrs } from '../src/lib/qr.js';
import { vehicleDefaults, vehiclePhoto } from '../src/lib/vehicle.js';
import { EMAIL_VEHICLE_PHOTO } from '../src/config.js';

const pay = {
  venmo: 'https://venmo.com/u/ejemplo',
  cashapp: 'https://cash.app/$ejemplo',
  zelle: 'pagos@ejemplo.com',
};
const qr = await payQrs(pay);
// Miniatura del vehículo: el correo real la pide a SITE_URL; aquí se apunta al archivo local para verla sin red.
const site = process.env.SITE_URL || 'https://ejemplo.vercel.app';
const localPhoto = new URL(`../public${EMAIL_VEHICLE_PHOTO.path}`, import.meta.url).href;
const inline = (html) =>
  html
    .replace(/cid:([\w-]+)/g, (m, id) => {
      const key = id.replace('-qr', '');
      return qr[key] ? `data:image/png;base64,${qr[key].toString('base64')}` : m;
    })
    .split(`${site}${EMAIL_VEHICLE_PHOTO.path}`)
    .join(localPhoto);

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

const out = process.env.PREVIEW_OUT
  ? pathToFileURL(`${process.env.PREVIEW_OUT.replace(/[\\/]+$/, '')}/`)
  : new URL('../dist-email-preview/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, html) => {
  const page = inline(html);
  writeFileSync(new URL(name, out), page);
  return Buffer.byteLength(html);
};

// Vehículo: descripción de src/config.js y placa SOLO de la variable VEHICLE_PLATE (si no está, sin placa).
// Conductor: DRIVER_DEFAULT_NAME o DRIVER_NAME.
//   PowerShell:  $env:VEHICLE_PLATE='ABC1234'; npm run preview:emails
const env = { ...process.env, SITE_URL: site };
const vehicleEs = vehicleDefaults(env, 'es');
const vehicleEn = vehicleDefaults(env, 'en');

const driver = buildEmail(trip, {
  serviceName: () => 'Airport (AUS)',
  pay,
  qr,
  confirmUrl: `${site}/api/confirm?t=EJEMPLO`,
  vehicle: vehicleEs,
});
const sizes = {
  'chofer.html': write('chofer.html', driver.html),
  'pasajero-es.html': write('pasajero-es.html', buildConfirmationEmail(trip, '$85.00', pay, qr, { vehicle: vehicleEs, photo: vehiclePhoto(vehicleEs, env, 'es') }).html),
  'pasajero-en.html': write(
    'pasajero-en.html',
    buildConfirmationEmail({ ...trip, lang: 'en', name: 'Ana Lopez' }, '$85.00', pay, qr, { vehicle: vehicleEn, photo: vehiclePhoto(vehicleEn, env, 'en') }).html,
  ),
  // Vehículo editado por el chofer: sin miniatura.
  'pasajero-otro-vehiculo.html': write(
    'pasajero-otro-vehiculo.html',
    buildConfirmationEmail({ ...trip, lang: 'en', name: 'Ana Lopez' }, '$85.00', pay, qr, {
      vehicle: { ...vehicleEn, description: 'White Chevy Suburban' },
      photo: vehiclePhoto({ description: 'White Chevy Suburban' }, env, 'en'),
    }).html,
  ),
};
for (const [name, bytes] of Object.entries(sizes)) console.log(`${name}: ${(bytes / 1024).toFixed(1)} KB de HTML`);
console.log(`Listo en ${out.pathname}`);
