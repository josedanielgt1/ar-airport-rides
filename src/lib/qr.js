/*
  Códigos QR de pago generados en el SERVIDOR desde los enlaces de las variables de entorno
  (PAY_VENMO_URL / PAY_CASHAPP_URL). No hay imágenes de pago en el repositorio ni en el sitio.
  Se adjuntan al correo como imágenes en línea (CID), que Gmail y Apple Mail muestran sin bloquearlas.
*/
import QRCode from 'qrcode';

const OPTIONS = { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 400, color: { dark: '#000000', light: '#FFFFFF' } };

/** PNG (Buffer) del QR de un enlace. Fondo blanco con margen: se lee bien incluso sobre un correo oscuro. */
export const qrPng = (text) => QRCode.toBuffer(String(text), OPTIONS);

/**
 * QR de las opciones de pago configuradas: { venmo?: Buffer, cashapp?: Buffer }.
 * Si algo falla se omite ese QR: el correo se envía igual (con el enlace como respaldo).
 */
export async function payQrs(pay = {}) {
  const out = {};
  for (const key of ['venmo', 'cashapp']) {
    if (!pay[key]) continue;
    try {
      out[key] = await qrPng(pay[key]);
    } catch {
      console.error(`reserve: no se pudo generar el QR (${key})`);
    }
  }
  return out;
}

const NAMES = { venmo: 'venmo-qr', cashapp: 'cashapp-qr' };

/** Identificador para <img src="cid:…"> de cada QR. */
export const qrCid = (key) => NAMES[key];

/** Adjuntos en línea para la API de Resend (content_id enlaza con <img src="cid:…">). */
export const qrAttachments = (qr = {}) =>
  Object.entries(qr)
    .filter(([key, buf]) => NAMES[key] && buf)
    .map(([key, buf]) => ({
      filename: `${NAMES[key]}.png`,
      content: Buffer.from(buf).toString('base64'),
      content_type: 'image/png',
      content_id: NAMES[key],
    }));
