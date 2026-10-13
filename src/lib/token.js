/*
  Enlace de confirmación para el chofer (sin base de datos). Los datos de la reserva viajan DENTRO del enlace,
  cifrados y autenticados con AES-256-GCM: nadie puede leerlos ni modificarlos, y el enlace vence.
  Solo se manda en el correo al chofer.

  Formato v1 (actual): base64url( 0x01 | iv(12) | tag(16) | datos cifrados ), clave = HKDF-SHA256(secreto,
  info "ar-confirm-v1"). Formato antiguo (sin byte de versión, clave = SHA-256(secreto)): solo se ABRE, para
  no romper los enlaces que ya estaban en el correo al desplegar; vence solo (ver LEGACY_TTL_MS).

  Claves (variables de entorno):
  - CONFIRM_SECRET: obligatoria para los enlaces, >= 32 caracteres aleatorios. Si falta o es más corta, los
    enlaces se desactivan (la reserva sigue funcionando sin el botón de confirmar) y se avisa en el log.
  - CONFIRM_SECRET_PREVIOUS (opcional): la clave anterior durante una rotación. Solo sirve para ABRIR enlaces
    ya enviados; los nuevos se cifran siempre con CONFIRM_SECRET. Quitarla cuando pase TOKEN_TTL_MS.
*/
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Vigencia del enlace: 24 h. El chofer responde en minutos u horas (el enlace es para contestar la solicitud,
 * no para el día del viaje). Además coincide con la ventana de 24 h en que Resend recuerda la Idempotency-Key
 * (ver src/lib/confirm.js): como el primer envío ocurre después de emitir el enlace, mientras el enlace es
 * válido cualquier reenvío cae dentro de esa ventana y Resend no manda un segundo correo.
 * Subirla (p. ej. a 72 h) es posible, pero entre las 24 h y el vencimiento se podría volver a enviar.
 */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Vigencia con la que se emitían los enlaces antiguos (para calcular cuándo se emitieron). */
const LEGACY_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const MIN_SECRET = 32;
const VERSION = 0x01;
const INFO = 'ar-confirm-v1';

const keyV1 = (secret) => Buffer.from(hkdfSync('sha256', String(secret), Buffer.alloc(0), INFO, 32));
const keyLegacy = (secret) => createHash('sha256').update(String(secret)).digest();

/** 'ok' | 'missing' | 'short' para CONFIRM_SECRET. */
export function secretStatus(env = {}) {
  const s = String(env.CONFIRM_SECRET ?? '');
  if (!s) return 'missing';
  return s.length >= MIN_SECRET ? 'ok' : 'short';
}

/** true si CONFIRM_SECRET existe y tiene al menos 32 caracteres. */
export const secretOk = (env = {}) => secretStatus(env) === 'ok';

/** Aviso para el log (sin mostrar la clave) si la configuración de claves es débil, o null si está bien. */
export function weakSecretMessage(env = {}) {
  const prev = String(env.CONFIRM_SECRET_PREVIOUS ?? '');
  if (secretStatus(env) === 'short') {
    return `confirm: CONFIRM_SECRET tiene menos de ${MIN_SECRET} caracteres; los enlaces de confirmación están DESACTIVADOS hasta rotarla (ver .env.example).`;
  }
  if (prev && prev.length < MIN_SECRET) return `confirm: CONFIRM_SECRET_PREVIOUS tiene menos de ${MIN_SECRET} caracteres y se ignora.`;
  return null;
}

const warned = new Set();
/** Escribe el aviso de weakSecretMessage UNA vez por instancia (para no llenar el log). */
export function warnWeakSecret(env = {}, log = console.warn) {
  const msg = weakSecretMessage(env);
  if (!msg || warned.has(msg)) return;
  warned.add(msg);
  log(msg);
}

/**
 * Claves que pueden ABRIR enlaces: la actual y, si existe, la anterior (rotación). Las que no llegan a
 * 32 caracteres se ignoran (falla cerrado). Sin clave actual válida no se abre nada.
 */
export function secretsOf(env = {}) {
  if (!secretOk(env)) return [];
  const list = [String(env.CONFIRM_SECRET)];
  const prev = String(env.CONFIRM_SECRET_PREVIOUS ?? '');
  if (prev.length >= MIN_SECRET && prev !== list[0]) list.push(prev);
  return list;
}

function assertSecret(secret) {
  if (String(secret ?? '').length < MIN_SECRET) {
    throw new Error(`CONFIRM_SECRET debe tener al menos ${MIN_SECRET} caracteres`);
  }
}

/** Cifra `payload` y le añade el vencimiento. Devuelve texto seguro para una URL. Lanza si la clave es corta. */
export function sealToken(payload, secret, now = Date.now(), ttlMs = TOKEN_TTL_MS) {
  assertSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyV1(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...payload, exp: now + ttlMs }), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]).toString('base64url');
}

function decrypt(key, iv, tag, body) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Bytes del token si su texto es base64url CANÓNICO (sin relleno, espacios ni variantes que decodifican a lo
 * mismo), o null. Así un mismo enlace no se puede escribir de dos formas (importa para la Idempotency-Key).
 */
export function tokenBytes(token) {
  const s = String(token ?? '');
  if (!s || s.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const raw = Buffer.from(s, 'base64url');
  return raw.toString('base64url') === s ? raw : null;
}

/**
 * Datos del enlace, o null si está alterado, mal formado, no canónico, cifrado con otra clave o vencido.
 * @param {string} token
 * @param {string|string[]} secrets clave o lista de claves (actual primero, luego la anterior)
 */
export function openToken(token, secrets, now = Date.now()) {
  const raw = tokenBytes(token);
  if (!raw || raw.length < 30) return null;
  const keys = (Array.isArray(secrets) ? secrets : [secrets]).filter((s) => String(s ?? '').length >= MIN_SECRET);
  for (const secret of keys) {
    if (raw[0] === VERSION && raw.length >= 30) {
      const data = decrypt(keyV1(secret), raw.subarray(1, 13), raw.subarray(13, 29), raw.subarray(29));
      if (data) return data.exp > now ? data : null;
    }
    // Formato antiguo (14 días): se acepta solo durante TOKEN_TTL_MS desde que se emitió.
    const old = decrypt(keyLegacy(secret), raw.subarray(0, 12), raw.subarray(12, 28), raw.subarray(28));
    if (old) {
      const issued = Number(old.exp) - LEGACY_TTL_MS;
      return Number(old.exp) > now && issued + TOKEN_TTL_MS > now ? old : null;
    }
  }
  return null;
}

/**
 * Identificador estable del enlace (no revela el token): mismo enlace → mismo valor, aunque se abra con la
 * clave anterior. null si el token no es canónico.
 */
export function tokenId(token) {
  const raw = tokenBytes(token);
  return raw ? createHash('sha256').update(raw).digest('hex') : null;
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

/**
 * Enlace completo a la página de confirmación, o null si falta la clave (o es corta) o la dirección del sitio.
 * Nunca lanza: una clave mal configurada no debe impedir que llegue la reserva al chofer.
 */
export function confirmUrl(env, payload, now = Date.now()) {
  const base = siteUrl(env);
  warnWeakSecret(env);
  if (!secretOk(env) || !base) return null;
  return `${base}/api/confirm?t=${sealToken(payload, env.CONFIRM_SECRET, now)}`;
}
