import data from './data/services.json';
import { getLang, onLangChange } from './i18n/index.js';

// La lista ya viene en el HTML (en inglés, generada en el build); aquí solo se traduce.
export function initServices() {
  const byId = new Map(data.items.map((s) => [s.id, s]));
  const rows = document.querySelectorAll('.service[data-service]');

  const apply = (lang) => {
    rows.forEach((row) => {
      const item = byId.get(row.dataset.service);
      const text = item?.[lang] ?? item?.en;
      if (!text) return;
      row.querySelector('.service__name').textContent = text.name;
      row.querySelector('.service__desc').textContent = text.desc;
    });
  };

  apply(getLang());
  onLangChange(apply);
}
