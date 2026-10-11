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
  // TODO(cliente): cambiar a correo con dominio propio cuando exista.
  email: 'abrahandrojasm@gmail.com',
  // TODO(cliente): confirmar métodos de pago (se muestran solo como texto, sin logos).
  // Enlaces decodificados de los QR del cliente (host verificado: venmo.com / cash.app).
  payLinks: {
    venmo: 'https://venmo.com/code?user_id=4534982609470700534&created=1791307404',
    cashapp: 'https://cash.app/$AbrahanRojas19?qr=1',
  },
  payments: ['Venmo', 'Cash App', 'Zelle'],
};
