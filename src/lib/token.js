/*
  Enlace de confirmación para el chofer (sin base de datos). Los datos de la reserva viajan DENTRO del enlace,
  cifrados y autenticados con AES-256-GCM usando CONFIRM_SECRET: nadie puede leerlos ni modificarlos, y el
  enlace vence. Solo se manda en el correo al chofer.
*/
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_SECRET = 16;

const keyOf = (secret) => createHash('sha256').update(String(secret)).digest();

/** true si CONFIRM_SECRET existe y es lo bastante larga. */
export const secretOk = (env = {}) => String(env.CONFIRM_SECRET ?? '').length >= MIN_SECRET;

/** Cifra `payload` y le añade el vencimiento. Devuelve texto seguro para una URL. */
export function sealToken(payload, secret, now = Date.now(), ttlMs = TOKEN_TTL_MS) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...payload, exp: now + ttlMs }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** Datos del enlace, o null si está alterado, mal formado o vencido. */
export function openToken(token, secret, now = Date.now()) {
  try {
    const raw = Buffer.from(String(token ?? ''), 'base64url');
    if (raw.length < 30) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const data = JSON.parse(json);
    return data && typeof data === 'object' && data.exp > now ? data : null;
  } catch {
    return null;
  }
}

/**
 * Dirección pública del sitio para armar el enlace del correo. NUNCA sale de la petición (la cabecera Host
 * la controla quien envía el formulario): viene de SITE_URL o, en Vercel, del dominio de producción.
 * Solo https (o localhost para desarrollo).
 */
export function siteUrl(env = {}) {
  const candidate = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  try {
    const u = new URL(String(candidate).trim());
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.username || u.password) return null;
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Enlace completo a la página de confirmación, o null si falta la clave o la dirección del sitio. */
export function confirmUrl(env, payload, now = Date.now()) {
  const base = siteUrl(env);
  if (!secretOk(env) || !base) return null;
  return `${base}/api/confirm?t=${sealToken(payload, env.CONFIRM_SECRET, now)}`;
}
