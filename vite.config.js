import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Inserta la lista de servicios (en inglés) en el HTML a partir de src/data/services.json,
 * para que se lea sin JS. En el navegador, src/services.js cambia los textos al idioma activo.
 */
function servicesList() {
  const file = new URL('./src/data/services.json', import.meta.url);
  return {
    name: 'services-list',
    configureServer(server) {
      server.watcher.add(fileURLToPath(file));
    },
    transformIndexHtml(html) {
      const { items } = JSON.parse(readFileSync(file, 'utf-8'));
      const markup = items
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
      return html.replace('<!-- services:list -->', markup);
    },
  };
}

// GitHub Pages sirve el sitio en /ar-airport-rides/; Vercel, en la raíz.
export default defineConfig({
  base: process.env.GH_PAGES ? '/ar-airport-rides/' : '/',
  plugins: [servicesList()],
});
