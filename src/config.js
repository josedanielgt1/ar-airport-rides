// Datos de contacto editables en un solo lugar. El HTML los recibe en el build (vite.config.js)
// y el JS los usa en el navegador.
export const CONFIG = {
  // TODO(cliente): confirmar teléfono visible y horario "24/7".
  phone: '737-529-1720',
  phoneTel: '+17375291720',
  // TODO(cliente): confirmar número de WhatsApp. Provisional: el mismo teléfono.
  whatsapp: '17375291720',
  // TODO(cliente): cambiar a correo con dominio propio cuando exista.
  email: 'abrahandrojasm@gmail.com',
  // TODO(cliente): confirmar métodos de pago (se muestran solo como texto, sin logos).
  payments: ['Venmo', 'Cash App', 'Zelle'],
};
