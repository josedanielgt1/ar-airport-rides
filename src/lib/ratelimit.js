/*
  Antiabuso de /api/reserve sin base de datos ni servicios de pago. Solo lo usa el servidor (api/reserve.js).

  IMPORTANTE (honestidad): todo lo que vive aquí es "mejor esfuerzo". En Vercel cada instancia de la
  función tiene su propia memoria, puede haber varias en paralelo y se reciclan al rato: un atacante con
  muchas IP o que caiga en instancias distintas puede superar estos números. La capa fuerte es una regla
  de Rate Limiting en Vercel Firewall (ver el comentario de api/reserve.js y el informe de seguridad).
*/

/* ---------- Límites ---------- */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Ventanas por clave. Cada regla: { windowMs, max } (máximo de solicitudes dentro de la ventana). */
export const LIMITS = {
  // Por IP: cuenta TODAS las solicitudes POST (también las inválidas o de bots).
  ip: [
    { windowMs: 10 * MIN, max: 5 },
    { windowMs: DAY, max: 20 },
  ],
  // Por correo y por teléfono del pasajero: un pasajero real no pide más de unas pocas reservas por hora.
  email: [
    { windowMs: HOUR, max: 3 },
    { windowMs: DAY, max: 6 },
  ],
  phone: [
    { windowMs: HOUR, max: 3 },
    { windowMs: DAY, max: 6 },
  ],
  // Tope global POR INSTANCIA de correos que se intentan enviar al chofer (protege la cuota de Resend).
  global: [
    { windowMs: HOUR, max: 20 },
    { windowMs: DAY, max: 60 },
  ],
};

/**
 * Limitador de ventana deslizante en memoria. Guarda marcas de tiempo por clave; borra solo lo vencido y,
 * si hay demasiadas claves, descarta las más antiguas (nunca vacía todo de golpe: eso reiniciaría el
 * límite para todos, que era el fallo SEC-12).
 */
export class SlidingLimiter {
  /** @param {{ rules: {windowMs:number,max:number}[], maxKeys?: number }} opts */
  constructor({ rules, maxKeys = 5000 }) {
    this.rules = rules;
    this.maxKeys = maxKeys;
    this.longest = Math.max(...rules.map((r) => r.windowMs));
    this.hits = new Map();
  }

  /** ¿Superaría la clave algún límite si se registrara una solicitud más ahora? (no registra nada) */
  wouldExceed(key, now = Date.now()) {
    const list = this.#recent(key, now);
    return this.rules.some((r) => list.filter((t) => now - t < r.windowMs).length >= r.max);
  }

  /** Registra una solicitud. Devuelve true si con ella se superó algún límite. */
  hit(key, now = Date.now()) {
    const list = this.#recent(key, now);
    list.push(now);
    // Reinserta para que el orden del Map sea "uso más reciente al final".
    this.hits.delete(key);
    this.hits.set(key, list);
    this.#prune(now);
    return this.rules.some((r) => list.filter((t) => now - t < r.windowMs).length > r.max);
  }

  reset() {
    this.hits.clear();
  }

  get size() {
    return this.hits.size;
  }

  #recent(key, now) {
    // Se guardan como mucho tantas marcas como el mayor "max" (más no cambia el resultado).
    const cap = Math.max(...this.rules.map((r) => r.max)) + 1;
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.longest);
    return list.length > cap ? list.slice(-cap) : list;
  }

  #prune(now) {
    if (this.hits.size <= this.maxKeys) return;
    // 1) borra las claves sin marcas vigentes; 2) si aún sobran, las de uso más antiguo.
    for (const [k, list] of this.hits) {
      if (!list.some((t) => now - t < this.longest)) this.hits.delete(k);
    }
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/* ---------- IP del cliente ---------- */

const IP_RE = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * IP del visitante tomada SOLO de las cabeceras que pone Vercel (x-vercel-forwarded-for, x-real-ip).
 * Nunca se usa X-Forwarded-For: el cliente puede escribir lo que quiera en ella. Fuera de Vercel (tests,
 * `vercel dev`) cae a la dirección del socket. Si el dominio pasara por el proxy de Cloudflare (nube
 * naranja), estas cabeceras traerían la IP de Cloudflare: no activar ese proxy sin ajustar esto.
 */
export function clientIp(req) {
  const h = req?.headers ?? {};
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip']) {
    const v = String(h[name] ?? '')
      .split(',')[0]
      .trim();
    if (IP_RE.test(v)) return v.toLowerCase();
  }
  const sock = String(req?.socket?.remoteAddress ?? '').trim();
  return IP_RE.test(sock) ? sock.toLowerCase() : 'unknown';
}

/* ---------- Claves normalizadas de correo y teléfono ---------- */

/** Correo en minúsculas, sin alias "+etiqueta" ni puntos de Gmail (para que no se esquive el límite). */
export function emailKey(email) {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at).split('+')[0];
  const domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  return local ? `${local}@${domain}` : null;
}

/** Teléfono solo con dígitos; los números de EE. UU. con o sin el 1 inicial cuentan como el mismo. */
export function phoneKey(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/* ---------- Origen de la petición (CSRF) ---------- */

/** Orígenes de producción. Para otro dominio sin tocar código: variable opcional ALLOWED_ORIGINS (coma). */
export const PROD_ORIGINS = ['https://arairportrides.com', 'https://www.arairportrides.com', 'https://ar-airport-rides.vercel.app'];

// Previews de ESTE proyecto en Vercel: ar-airport-rides-<hash>-<equipo>.vercel.app / ar-airport-rides-git-<rama>-<equipo>.vercel.app
const PREVIEW_HOST_RE = /^ar-airport-rides-[a-z0-9-]{1,80}\.vercel\.app$/;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

const originOf = (value) => {
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { origin: u.origin, host: u.host.toLowerCase(), protocol: u.protocol };
  } catch {
    return null;
  }
};

/**
 * ¿Es un origen permitido? `host` es la cabecera Host de la petición (en Vercel, el dominio realmente
 * pedido). Una preview solo se acepta si además coincide con el Host: así otro proyecto llamado
 * "ar-airport-rides-algo" en vercel.app no puede enviar reservas a producción.
 */
export function originAllowed(origin, { host = '', env = {} } = {}) {
  const o = originOf(origin);
  if (!o) return false;
  const extra = String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (o.protocol === 'https:' && [...PROD_ORIGINS, ...extra].includes(o.origin)) return true;
  const reqHost = String(host).toLowerCase();
  const deployHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter(Boolean)
    .map((h) => String(h).toLowerCase());
  if (o.protocol === 'https:' && o.host === reqHost && (deployHosts.includes(o.host) || PREVIEW_HOST_RE.test(o.host))) return true;
  // Desarrollo local (vite / vercel dev): nunca en el despliegue de producción.
  if (env.VERCEL_ENV !== 'production' && LOCAL_HOST_RE.test(o.host)) return true;
  return false;
}

/**
 * Decide si la petición viene de nuestro propio sitio.
 * 1. Sec-Fetch-Site (lo pone el navegador; una página no lo puede falsificar): solo "same-origin".
 * 2. Si no está (navegadores viejos): Origin en la lista permitida ("null" se rechaza).
 * 3. Sin ninguna de las dos:
 *    - JSON: se acepta. Un navegador no puede mandar JSON a otro sitio sin una consulta previa (preflight)
 *      que esta función no autoriza, así que no hay CSRF posible; quien llega así es un cliente fuera del
 *      navegador (curl, bot) y lo frenan los límites. Rechazarlo no añade seguridad.
 *    - Formulario sin JS (urlencoded): es una petición "simple" que sí puede venir de otro sitio, así que
 *      se exige prueba: Referer de un origen permitido; si tampoco hay, se rechaza.
 * @returns {boolean}
 */
export function sameOriginRequest(req, { json, env = {} } = {}) {
  const h = req?.headers ?? {};
  const host = String(h['x-forwarded-host'] ?? h.host ?? '').split(',')[0].trim();
  const site = String(h['sec-fetch-site'] ?? '').trim().toLowerCase();
  if (site) return site === 'same-origin';
  const origin = h.origin;
  if (origin != null && String(origin) !== '') return originAllowed(origin, { host, env });
  if (json) return true;
  const ref = originOf(h.referer ?? h.referrer ?? '');
  return Boolean(ref && originAllowed(ref.origin, { host, env }));
}

/* ---------- Estado de la instancia ---------- */

export function createGuards() {
  return {
    ip: new SlidingLimiter({ rules: LIMITS.ip }),
    email: new SlidingLimiter({ rules: LIMITS.email }),
    phone: new SlidingLimiter({ rules: LIMITS.phone }),
    global: new SlidingLimiter({ rules: LIMITS.global, maxKeys: 1 }),
  };
}

/** Limitadores compartidos por todas las solicitudes que atiende esta instancia. */
export const guards = createGuards();

export function resetGuards(g = guards) {
  for (const l of Object.values(g)) l.reset();
}
