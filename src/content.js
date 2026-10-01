import services from './data/services.json';
import amenities from './data/amenities.json';
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
      if (item) li.textContent = item[lang] ?? item.en;
    });
  };

  apply(getLang());
  onLangChange(apply);

  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
}

/** Nombre del servicio en el idioma pedido (para el mensaje de WhatsApp). */
export const serviceName = (id, lang) => {
  const item = services.items.find((s) => s.id === id);
  return item ? (item[lang] ?? item.en).name : id;
};
