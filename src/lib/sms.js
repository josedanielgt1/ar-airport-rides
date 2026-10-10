/*
  Enlaces sms: con mensaje prellenado. Cada sistema separa el cuerpo de forma distinta:
  - iOS / iPadOS: sms:<número>&body=<texto>   (iPadOS 13+ se anuncia como "Macintosh" con pantalla táctil)
  - Android (Samsung incluido): sms:<número>?body=<texto>
  - Otros (escritorio, desconocido): solo sms:<número>, sin cuerpo (no hay formato fiable).
  Módulo puro: lo usan el navegador (src/sms.js) y las pruebas (test/sms.test.js).
*/

/**
 * @param {{ userAgent?: string, maxTouchPoints?: number }} [env]
 * @returns {'ios' | 'android' | 'other'}
 */
export function detectPlatform({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)) return 'ios';
  if (/\bMacintosh\b/i.test(userAgent) && maxTouchPoints > 1) return 'ios'; // iPadOS como Mac táctil
  if (/\bAndroid\b/i.test(userAgent)) return 'android';
  return 'other';
}

/** Número limpio para el esquema sms: (solo dígitos y un + inicial). */
export const cleanNumber = (number) => {
  const s = String(number ?? '').trim();
  const digits = s.replace(/\D/g, '');
  return s.startsWith('+') ? `+${digits}` : digits;
};

/**
 * @param {string} number  p. ej. "+17375291720"
 * @param {string} [body]  texto del mensaje (se codifica con encodeURIComponent)
 * @param {'ios' | 'android' | 'other'} [platform]
 */
export function smsHref(number, body = '', platform = 'other') {
  const num = cleanNumber(number);
  if (!body || platform === 'other') return `sms:${num}`;
  const text = encodeURIComponent(body);
  return platform === 'ios' ? `sms:${num}&body=${text}` : `sms:${num}?body=${text}`;
}
