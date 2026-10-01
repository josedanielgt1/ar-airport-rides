import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './src/config.js';

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
    email: CONFIG.email,
    waUrl: `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(en['wa.message'])}`,
    payments: CONFIG.payments.join(', '),
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
  return {
    name: 'data-markup',
    configureServer(server) {
      for (const f of ['services.json', 'service-area.json']) server.watcher.add(fileURLToPath(dataFile(f)));
    },
    transformIndexHtml(html) {
      const area = areaMarkup();
      const tokens = configTokens();
      html = html.replace(/@@(\w+)@@/g, (m, k) => (k in tokens ? esc(tokens[k]) : m));
      return html
        .replace('<!-- services:list -->', servicesMarkup())
        .replace('<!-- area:map -->', area.map)
        .replace('<!-- area:list -->', area.list)
        .replace('<!-- area:far -->', area.farList);
    },
  };
}

// GitHub Pages sirve el sitio en /ar-airport-rides/; Vercel, en la raíz.
export default defineConfig({
  base: process.env.GH_PAGES ? '/ar-airport-rides/' : '/',
  plugins: [dataMarkup()],
});
