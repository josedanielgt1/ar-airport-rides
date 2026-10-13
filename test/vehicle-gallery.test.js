import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  AMENITY_ICONS,
  amenitiesMarkup,
  checkVehicleData,
  confirmedAmenities,
  galleryMarkup,
  visiblePhotos,
} from '../src/lib/vehicle-gallery.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'));
const photos = read('../src/data/vehicle-photos.json');
const amenities = read('../src/data/amenities.json');
const inPublic = (src) => existsSync(new URL(`../public${src}`, import.meta.url));

test('datos del vehículo: sin errores y con los archivos en public/', () => {
  assert.deepEqual(checkVehicleData(photos, amenities, inPublic), []);
});

test('galería: hoy solo trasera y emblema, en orden (nada del interior todavía)', () => {
  assert.deepEqual(visiblePhotos(photos).map((p) => p.id), ['rear', 'badge']);
});

test('amenidades: exactamente las tres confirmadas por el dueño', () => {
  assert.deepEqual(confirmedAmenities(amenities).map((a) => a.id), ['water', 'charging', 'candy']);
  const text = JSON.stringify(amenities).toLowerCase();
  for (const word of ['wi-fi', 'wifi', 'licens', 'insur', 'seguro']) assert.ok(!text.includes(word), word);
});

test('galería: solo publica fotos enabled + confirmed y respeta el orden', () => {
  const data = {
    items: [
      { id: 'b', enabled: true, confirmed: true, order: 2, src: { webp: '/media/b.webp', jpg: '/media/b.jpg' }, width: 4, height: 3, alt: { en: 'B', es: 'B' } },
      { id: 'a', enabled: true, confirmed: true, order: 1, src: { webp: '/media/a.webp', jpg: '/media/a.jpg' }, width: 4, height: 3, alt: { en: 'A', es: 'A' } },
      { id: 'sin-revisar', enabled: true, confirmed: false, order: 0, src: {}, alt: {} },
      { id: 'apagada', enabled: false, confirmed: true, order: 0, src: {}, alt: {} },
    ],
  };
  assert.deepEqual(visiblePhotos(data).map((p) => p.id), ['a', 'b']);
  const html = galleryMarkup(data);
  assert.ok(!html.includes('sin-revisar') && !html.includes('apagada'));
  assert.match(html, /data-count="2"/);
  assert.ok(html.indexOf('data-photo="a"') < html.indexOf('data-photo="b"'));
});

test('galería: sin fotos visibles no genera nada (ni hueco ni texto)', () => {
  assert.equal(galleryMarkup({ items: [] }), '');
  assert.equal(galleryMarkup({ items: [{ id: 'x', enabled: false, confirmed: false }] }), '');
});

test('galería: rutas con la base de Vite, alt escapado, carga diferida y medidas', () => {
  const data = {
    items: [{ id: 'i', enabled: true, confirmed: true, order: 1, src: { webp: '/media/i.webp', jpg: '/media/i.jpg' }, width: 960, height: 720, alt: { en: 'Seats "rear" <row>', es: 'x' } }],
  };
  const html = galleryMarkup(data, { base: '/ar-airport-rides/' });
  assert.match(html, /srcset="\/ar-airport-rides\/media\/i\.webp"/);
  assert.match(html, /src="\/ar-airport-rides\/media\/i\.jpg"/);
  assert.match(html, /alt="Seats &quot;rear&quot; &lt;row&gt;"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /width="960" height="720"/);
  assert.match(galleryMarkup(data), /src="\/media\/i\.jpg"/);
});

test('validación: detecta foto publicada sin alt, sin archivo o con ruta fuera de /media/', () => {
  const bad = {
    items: [
      { id: 'p', enabled: true, confirmed: true, src: { webp: '/media/no.webp', jpg: 'http://x/y.jpg' }, width: 1, height: 1, alt: { en: 'ok', es: '' } },
      { id: 'p', enabled: false, confirmed: false },
    ],
  };
  const errors = checkVehicleData(bad, { items: [] }, () => false).join('\n');
  assert.match(errors, /src\.jpg debe empezar por \/media\//);
  assert.match(errors, /no existe public\/media\/no\.webp/);
  assert.match(errors, /falta alt\.es/);
  assert.match(errors, /repetido/);
});

test('validación: amenidad confirmada sin ícono o sin texto falla', () => {
  const errors = checkVehicleData({ items: [] }, { items: [{ id: 'z', confirmed: true, icon: 'nope', en: 'Z', es: '' }] }).join('\n');
  assert.match(errors, /ícono "nope"/);
  assert.match(errors, /falta el texto es/);
  assert.deepEqual(checkVehicleData({ items: [] }, { items: [{ id: 'z', confirmed: false }] }), []);
});

test('amenidades: íconos dorados finos, decorativos (aria-hidden) y texto aparte', () => {
  const html = amenitiesMarkup(amenities);
  assert.equal((html.match(/<li class="vehicle__amenity"/g) ?? []).length, 3);
  assert.equal((html.match(/aria-hidden="true" focusable="false"/g) ?? []).length, 3);
  const widths = [...html.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(widths.length === 3 && widths.every((w) => w >= 1.25 && w <= 1.5));
  assert.match(html, /<span class="vehicle__amenity-text">Bottled water<\/span>/);
  assert.match(html, /data-i18n="vehicle.amenitiesLabel"/);
  assert.equal(amenitiesMarkup({ items: [{ id: 'x', confirmed: false, icon: 'water', en: 'X', es: 'X' }] }), '');
  for (const id of ['water', 'charging', 'candy']) assert.ok(AMENITY_ICONS[id]);
});
