/*
  Sección "El vehículo": galería de detalles (src/data/vehicle-photos.json) y amenidades
  (src/data/amenities.json). Funciones puras: las usa el plugin del build (vite.config.js) para escribir el
  HTML en inglés, legible sin JS, y las pruebas (test/vehicle-gallery.test.js). src/content.js traduce.
*/

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
  Íconos de las amenidades: trazo fino dorado (currentColor), viewBox 24. A 28 px el trazo de 1.25 queda en
  ~1.46 px. Una amenidad nueva necesita su ícono aquí (si falta, el build falla).
*/
export const AMENITY_ICONS = {
  // Botella de agua: tapa, cuello, cuerpo y etiqueta.
  water: '<path d="M10.25 2.75h3.5v2.5h-3.5z" /><path d="M10.25 5.25 9.1 7.6C8.2 8.6 7.75 9.6 7.75 11v8.5c0 .97.78 1.75 1.75 1.75h5c.97 0 1.75-.78 1.75-1.75V11c0-1.4-.45-2.4-1.35-3.4l-1.15-2.35" /><path d="M7.75 13.25h8.5M7.75 17.25h8.5" />',
  // Teléfono con rayo de carga.
  charging: '<rect x="6.75" y="2.75" width="10.5" height="18.5" rx="2" /><path d="M10.75 18.25h2.5" /><path d="M12.6 6.75 10.4 11h3.2l-2.2 4.25" />',
  // Caramelo envuelto.
  candy: '<ellipse cx="12" cy="12" rx="4.75" ry="3.75" /><path d="M7.25 12 2.75 8.5v7l4.5-3.5ZM16.75 12l4.5-3.5v7l-4.5-3.5Z" />',
};

/** Fotos que se publican: enabled y confirmed (revisadas: sin placa ni personas), en orden. */
export function visiblePhotos(data) {
  return (data?.items ?? [])
    .filter((p) => p.enabled === true && p.confirmed === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Amenidades confirmadas por el dueño (las demás no se muestran). */
export function confirmedAmenities(data) {
  return (data?.items ?? []).filter((a) => a.confirmed === true);
}

/** Errores de datos (lista vacía = todo bien). `exists(path)` comprueba los archivos en public/. */
export function checkVehicleData(photos, amenities, exists = () => true) {
  const errors = [];
  const ids = new Set();
  for (const p of photos?.items ?? []) {
    const where = `vehicle-photos.json "${p.id}"`;
    if (!p.id || ids.has(p.id)) errors.push(`${where}: id vacío o repetido`);
    ids.add(p.id);
    if (!(p.enabled === true && p.confirmed === true)) continue;
    for (const k of ['webp', 'jpg']) {
      const src = p.src?.[k];
      if (typeof src !== 'string' || !src.startsWith('/media/')) errors.push(`${where}: src.${k} debe empezar por /media/`);
      else if (!exists(src)) errors.push(`${where}: no existe public${src}`);
    }
    if (!(p.width > 0 && p.height > 0)) errors.push(`${where}: width/height obligatorios`);
    for (const lang of ['en', 'es']) {
      if (!String(p.alt?.[lang] ?? '').trim()) errors.push(`${where}: falta alt.${lang}`);
    }
  }
  const aIds = new Set();
  for (const a of amenities?.items ?? []) {
    const where = `amenities.json "${a.id}"`;
    if (!a.id || aIds.has(a.id)) errors.push(`${where}: id vacío o repetido`);
    aIds.add(a.id);
    if (a.confirmed !== true) continue;
    if (!AMENITY_ICONS[a.icon]) errors.push(`${where}: ícono "${a.icon}" no definido en src/lib/vehicle-gallery.js`);
    for (const lang of ['en', 'es']) if (!String(a[lang] ?? '').trim()) errors.push(`${where}: falta el texto ${lang}`);
  }
  return errors;
}

/**
  Galería de detalles bajo la foto principal. Sin fotos visibles no se genera nada (ni hueco ni texto).
  `base` = base de Vite ('/' o '/ar-airport-rides/'): este HTML se inyecta después del procesado de Vite.
*/
export function galleryMarkup(data, { base = '/' } = {}) {
  const items = visiblePhotos(data);
  if (!items.length) return '';
  const url = (src) => esc(base.replace(/\/$/, '') + src);
  const li = items
    .map(
      (p) => `<li class="vehicle__shot" data-photo="${esc(p.id)}">
                <picture>
                  <source type="image/webp" srcset="${url(p.src.webp)}" />
                  <img class="vehicle__shot-img" src="${url(p.src.jpg)}" width="${Number(p.width)}" height="${Number(p.height)}" loading="lazy" decoding="async" alt="${esc(p.alt.en)}" />
                </picture>
              </li>`,
    )
    .join('\n              ');
  return `<div class="vehicle__gallery" role="region" aria-label="More views of the vehicle" data-i18n-attr="aria-label:vehicle.galleryLabel">
            <ul class="vehicle__gallery-list" role="list" data-count="${items.length}">
              ${li}
            </ul>
          </div>`;
}

/** Fila de amenidades confirmadas con su ícono. Sin ninguna confirmada no se genera nada. */
export function amenitiesMarkup(data) {
  const items = confirmedAmenities(data);
  if (!items.length) return '';
  const li = items
    .map(
      (a) => `<li class="vehicle__amenity" data-amenity="${esc(a.id)}">
                <svg class="vehicle__amenity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${AMENITY_ICONS[a.icon] ?? ''}</svg>
                <span class="vehicle__amenity-text">${esc(a.en)}</span>
              </li>`,
    )
    .join('\n              ');
  return `<div class="vehicle__extras">
            <h3 class="vehicle__amenities-label" id="vehicle-amenities-title" data-i18n="vehicle.amenitiesLabel">On board</h3>
            <ul class="vehicle__amenities" role="list" aria-labelledby="vehicle-amenities-title">
              ${li}
            </ul>
          </div>`;
}
