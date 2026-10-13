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
