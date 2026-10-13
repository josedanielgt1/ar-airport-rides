import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './src/config.js';
import { handleReservation, parseBody } from './src/lib/reservation.js';
import { handleConfirm } from './src/lib/confirm.js';
import { amenitiesMarkup, checkVehicleData, galleryMarkup } from './src/lib/vehicle-gallery.js';

// Claves de EJEMPLO solo para la simulación local (los valores reales viven en las variables de entorno de Vercel).
const DEV_ENV = { CONFIRM_SECRET: 'dev-only-secret-not-for-production', SITE_URL: 'http://localhost:5173', RESERVATION_TO_EMAIL: 'chofer@ejemplo.com' };
const DEV_PAY = { venmo: 'https://venmo.com/u/ejemplo', cashapp: 'https://cash.app/$ejemplo', zelle: 'pagos@ejemplo.com' };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const dataFile = (name) => new URL(`./src/data/${name}`, import.meta.url);
const readData = (name) => JSON.parse(readFileSync(dataFile(name), 'utf-8'));
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));

/** Valores de src/config.js para el HTML (marcadores @@clave@@). El HTML base está en inglés. */
function configTokens() {
  const en = readJson('./src/i18n/en.json');
  return {
    phone: CONFIG.phone,
    phoneTel: CONFIG.phoneTel,
    smsNumber: CONFIG.smsNumber,
    email: CONFIG.email,
    waUrl: `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(en['wa.message'])}`,
    year: String(new Date().getFullYear()),
  };
}

/** Lista de servicios (en inglés) desde services.json; src/services.js la traduce en el navegador. */
function servicesMarkup() {
  const { items } = readData('services.json');
  return items
    .map(
      (s) => `<li class="service" data-service="${esc(s.id)}">
              <svg class="service__icon" aria-hidden="true" focusable="false"><use href="#i-${esc(s.icon)}" /></svg>
              <div>
                <h3 class="service__name">${esc(s.en.name)}</h3>
                <p class="service__desc">${esc(s.en.desc)}</p>
              </div>
            </li>`,
    )
    .join('\n            ');
}

/** Créditos de fotos de terceros (src/data/credits.json): "Photo: <autor>, <licencia>" con enlaces. */
function creditsMarkup() {
  const { items } = readData('credits.json');
  return items
    .map(
      (c) =>
        `<p class="site-footer__credit" data-credit="${esc(c.id)}"><span data-i18n="credits.photo">Photo:</span> <a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.author)}</a>, <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener license">${esc(c.license)}</a></p>`,
    )
    .join('\n        ');
}

/**
 * Vehículo: galería de detalles (vehicle-photos.json) y amenidades confirmadas (amenities.json), con sus
 * validaciones (src/lib/vehicle-gallery.js). Si los datos tienen errores, el build falla con el motivo.
 */
function vehicleMarkup(base) {
  const photos = readData('vehicle-photos.json');
  const amenities = readData('amenities.json');
  const errors = checkVehicleData(photos, amenities, (src) => existsSync(new URL(`./public${src}`, import.meta.url)));
  if (errors.length) throw new Error(`Datos del vehículo con errores:\n- ${errors.join('\n- ')}`);
  return { gallery: galleryMarkup(photos, { base }), amenities: amenitiesMarkup(amenities) };
}

// Posición de la etiqueta de cada ciudad respecto a su punto (unidades del viewBox).
const LABEL = {
  left: { x: -12, y: 4.5, anchor: 'end' },
  right: { x: 12, y: 4.5, anchor: 'start' },
  above: { x: 0, y: -13, anchor: 'middle' },
  below: { x: 0, y: 22, anchor: 'middle' },
};

// Flechas de larga distancia: salen por el borde siguiendo su carretera.
const FAR = {
  north: { arrow: 'M194 26 L200 16 L206 26 M200 16 V44', text: { x: 212, y: 27, anchor: 'start' } },
  south: { arrow: 'M194 532 L200 542 L206 532 M200 542 V514', text: { x: 212, y: 541, anchor: 'start' } },
  east: { arrow: 'M383 252.5 L392 258 L385 265.5', text: { x: 392, y: 240, anchor: 'end' } },
};

/** Puntos del diagrama + listas en texto, desde service-area.json. */
function areaMarkup() {
  const { confirmed, airport, longDistance } = readData('service-area.json');

  const cities = confirmed
    .map((c) => {
      const l = LABEL[c.label] ?? LABEL.right;
      const mod = c.major ? ' city--major' : '';
      return `<g class="city${mod}" data-city="${esc(c.id)}" data-at="${c.at}" transform="translate(${c.x} ${c.y})">
            <circle class="city__halo" r="${c.major ? 18 : 14}" />
            <circle class="city__dot" r="${c.major ? 6.5 : 5}" />
            <text class="map__label city__label" x="${l.x}" y="${l.y}" text-anchor="${l.anchor}">${esc(c.name)}</text>
          </g>`;
    })
    .join('\n          ');

  const aus = `<g class="city city--airport" data-city="${esc(airport.id)}" data-at="${airport.at}" transform="translate(${airport.x} ${airport.y})">
            <circle class="city__halo" r="16" />
            <circle class="city__dot city__dot--airport" r="11" />
            <use class="city__plane" href="#i-plane" x="-8" y="-8" width="16" height="16" transform="rotate(45)" />
            <text class="map__label city__label" x="16" y="4.5" text-anchor="start">${esc(airport.code)}</text>
          </g>`;

  const far = longDistance.items
    .map((f) => {
      const g = FAR[f.dir];
      return `<g class="far" data-at="${longDistance.at}">
            <path class="far__arrow" d="${g.arrow}" />
            <text class="map__label far__label" x="${g.text.x}" y="${g.text.y}" text-anchor="${g.text.anchor}">${esc(f.name)} (${esc(f.airports)})</text>
          </g>`;
    })
    .join('\n          ');

  const list = confirmed
    .map(
      (c) =>
        `<li class="area__city" data-city="${esc(c.id)}"><span class="area__dot" aria-hidden="true"></span>${esc(c.name)}</li>`,
    )
    .concat(
      `<li class="area__city" data-city="${esc(airport.id)}"><span class="area__dot" aria-hidden="true"></span><span data-i18n="area.airport">AUS airport</span></li>`,
    )
    .join('\n              ');

  const farList = longDistance.items
    .map((f) => `<li>${esc(f.name)} <span class="area__airports">(${esc(f.airports)})</span></li>`)
    .join('\n                ');

  return { map: `${cities}\n          ${aus}\n          ${far}`, list, farList };
}

/** Inserta en el HTML el contenido generado desde src/data/*.json (legible sin JS). */
function dataMarkup() {
  let base = '/';
  return {
    name: 'data-markup',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      for (const f of ['services.json', 'service-area.json', 'amenities.json', 'vehicle-photos.json', 'credits.json']) server.watcher.add(fileURLToPath(dataFile(f)));
    },
    transformIndexHtml(html) {
      const area = areaMarkup();
      const vehicle = vehicleMarkup(base);
      const tokens = configTokens();
      html = html.replace(/@@(\w+)@@/g, (m, k) => (k in tokens ? esc(tokens[k]) : m));
      return html
        .replace('<!-- services:list -->', servicesMarkup())
        .replace('<!-- vehicle:gallery -->', vehicle.gallery)
        .replace('<!-- amenities:list -->', vehicle.amenities)
        .replace('<!-- credits:list -->', creditsMarkup())
        .replace('<!-- area:map -->', area.map)
        .replace('<!-- area:list -->', area.list)
        .replace('<!-- area:far -->', area.farList);
    },
  };
}

/**
 * SOLO DESARROLLO — SIMULACIÓN de /api/reserve: valida igual que el servidor real y responde
 * { ok: true, simulated: true } SIN ENVIAR NINGÚN CORREO. En producción responde api/reserve.js (Vercel).
 */
function devReserveSimulation() {
  return {
    name: 'dev-reserve-simulation',
    apply: 'serve',
    configureServer(server) {
      const services = readData('services.json');
      const serviceIds = services.items.map((s) => s.id);
      server.middlewares.use('/api/reserve', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          const contentType = String(req.headers['content-type'] ?? '');
          const input = parseBody(Buffer.concat(chunks), contentType);
          const result = await handleReservation(input, {
            ip: `dev-${Date.now()}-${Math.random()}`, // sin límite por IP en la simulación
            serviceIds,
            env: DEV_ENV,
            // Datos de pago de EJEMPLO (los reales viven en variables de entorno de Vercel, nunca en el repo).
            pay: DEV_PAY,
            // No se envía nada: se imprime el correo para revisarlo aquí (son datos de prueba, solo en tu consola).
            send: async (_config, email) => {
              server.config.logger.info(`[simulación] Correo que recibiría el chofer:\n${email.text}\n(Reply-To: ${email.replyTo ?? 'sin correo del pasajero'})`);
              return { simulated: true };
            },
          });
          server.config.logger.info(`[simulación] POST /api/reserve → ${result.status} (no se envió ningún correo)`);
          if (!contentType.includes('application/json')) {
            res.statusCode = 303;
            res.setHeader('Location', `/#${result.anchor}`);
            return res.end();
          }
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.body));
        });
      });
    },
  };
}

/**
 * SOLO DESARROLLO — SIMULACIÓN de /api/confirm (la página donde el chofer escribe la tarifa). El enlace que
 * imprime la simulación de /api/reserve abre esta página; al enviar NO se manda ningún correo.
 */
function devConfirmSimulation() {
  return {
    name: 'dev-confirm-simulation',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/confirm', (req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          const method = req.method ?? 'GET';
          const query = Object.fromEntries(new URL(req.url ?? '/', 'http://localhost').searchParams);
          const body = method === 'POST' ? parseBody(Buffer.concat(chunks), String(req.headers['content-type'] ?? '')) : {};
          const result = await handleConfirm({
            method,
            query,
            body,
            ip: `dev-${Date.now()}-${Math.random()}`,
            env: { ...DEV_ENV, RESEND_API_KEY: 'dev', RESERVATION_FROM_EMAIL: 'dev@ejemplo.com' },
            pay: DEV_PAY,
            send: async (_config, email) => {
              server.config.logger.info(`[simulación] Correo de confirmación para el pasajero (no se envía):\nAsunto: ${email.subject}\n${email.text}`);
              return { simulated: true };
            },
          });
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(result.html);
        });
      });
    },
  };
}

// GitHub Pages sirve el sitio en /ar-airport-rides/; Vercel, en la raíz.
// Multi-página: privacy/index.html y terms/index.html salen como dist/privacy/ y dist/terms/
// (Vercel y Pages los sirven en /privacy y /terms sin reglas extra).
export default defineConfig({
  base: process.env.GH_PAGES ? '/ar-airport-rides/' : '/',
  plugins: [dataMarkup(), devReserveSimulation(), devConfirmSimulation()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)),
        terms: fileURLToPath(new URL('./terms/index.html', import.meta.url)),
      },
    },
  },
});
