// Datos de contacto editables en un solo lugar. El HTML los recibe en el build (vite.config.js)
// y el JS los usa en el navegador.
export const CONFIG = {
  // TODO(cliente): confirmar teléfono visible y horario "24/7".
  phone: '737-529-1720',
  phoneTel: '+17375291720',
  // TODO(cliente): confirmar que este número recibe mensajes de texto (SMS).
  smsNumber: '+17375291720',
  // TODO(cliente): confirmar número de WhatsApp. Provisional: el mismo teléfono.
  whatsapp: '17375291720',
  // Correo público de la empresa (reenvía por Cloudflare Email Routing). El Gmail personal del
  // chofer NO va en el sitio: se configura solo como RESERVATION_TO_EMAIL en Vercel.
  email: 'reservas@arairportrides.com',
  // Los datos de pago NO van en el sitio: viven en variables de entorno (PAY_*) y solo salen en el
  // correo al chofer (ver .env.example y src/lib/reservation.js).
};

// Vehículo que aparece en el correo de confirmación al pasajero ("Your ride: …"). Es el valor por defecto
// que el chofer ve prellenado en /api/confirm y puede cambiar antes de enviar. Va en el idioma del
// pasajero. La PLACA no va aquí (repo público): variable de entorno VEHICLE_PLATE. VEHICLE_DESCRIPTION,
// si existe, reemplaza esta descripción en ambos idiomas. Ver src/lib/vehicle.js.
export const VEHICLE_DEFAULT = {
  en: 'Black Ford Expedition XLT',
  es: 'Ford Expedition XLT negra',
  plateState: 'Texas',
};

// Conductor que aparece en el correo de confirmación al pasajero ("Your chauffeur: …"). Valor por defecto que el
// chofer ve prellenado en /api/confirm y puede cambiar (o vaciar) antes de enviar. La variable de entorno
// DRIVER_NAME, si existe y es válida, lo reemplaza. Ver src/lib/vehicle.js.
export const DRIVER_DEFAULT_NAME = 'Abraham Rojas';

// Miniatura del vehículo en el boleto del correo al pasajero: SOLO cuando la descripción final es la
// predeterminada (nunca la foto de otro carro). Se sirve bajo SITE_URL; foto sin placa, 240×180 (2x), fondo #000.
export const EMAIL_VEHICLE_PHOTO = { path: '/media/email-vehicle.jpg', width: 120, height: 90 };
