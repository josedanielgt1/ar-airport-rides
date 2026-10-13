import services from './data/services.json';
import amenities from './data/amenities.json';
import vehiclePhotos from './data/vehicle-photos.json';
import { getLang, onLangChange } from './i18n/index.js';

/*
  Textos que vienen de src/data/*.json (no de src/i18n): el HTML ya los trae en inglés, generados en el
  build; aquí solo se traducen al idioma activo. También actualiza el año del footer.
*/
export function initContent() {
  const serviceById = new Map(services.items.map((s) => [s.id, s]));
  const amenityById = new Map(amenities.items.map((a) => [a.id, a]));

  const rows = document.querySelectorAll('.service[data-service]');
  const options = document.querySelectorAll('#f-service option[value]:not([value=""])');
  const amenityItems = document.querySelectorAll('[data-amenity]');
  const photoById = new Map(vehiclePhotos.items.map((p) => [p.id, p]));
  const photoItems = document.querySelectorAll('[data-photo]');

  const apply = (lang) => {
    rows.forEach((row) => {
      const item = serviceById.get(row.dataset.service);
      const text = item?.[lang] ?? item?.en;
      if (!text) return;
      row.querySelector('.service__name').textContent = text.name;
      row.querySelector('.service__desc').textContent = text.desc;
    });
    options.forEach((opt) => {
      const item = serviceById.get(opt.value);
      if (item) opt.textContent = (item[lang] ?? item.en).name;
    });
    amenityItems.forEach((li) => {
      const item = amenityById.get(li.dataset.amenity);
      const text = li.querySelector('.vehicle__amenity-text');
      if (item && text) text.textContent = item[lang] ?? item.en;
    });
    photoItems.forEach((li) => {
      const item = photoById.get(li.dataset.photo);
      const img = li.querySelector('img');
      if (item && img) img.alt = item.alt[lang] ?? item.alt.en;
    });
  };

  apply(getLang());
  onLangChange(apply);

  // Galería en carrusel (móvil): solo cuando de verdad se desplaza entra en el orden de tabulación,
  // para poder recorrerla con las flechas del teclado.
  const gallery = document.querySelector('.vehicle__gallery');
  if (gallery) {
    const syncFocus = () => {
      if (gallery.scrollWidth > gallery.clientWidth + 1) gallery.setAttribute('tabindex', '0');
      else gallery.removeAttribute('tabindex');
    };
    syncFocus();
    if ('ResizeObserver' in window) new ResizeObserver(syncFocus).observe(gallery);
  }

  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
}

/** Nombre del servicio en el idioma pedido (para el mensaje de WhatsApp). */
export const serviceName = (id, lang) => {
  const item = services.items.find((s) => s.id === id);
  return item ? (item[lang] ?? item.en).name : id;
};
