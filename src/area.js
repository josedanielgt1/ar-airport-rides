import { oneWayScrub } from './scrub.js';

/*
  Mapa del área de servicio: al hacer scroll, las carreteras se trazan en dorado (la I-35 de norte a
  sur, cada ramal en su tramo de progreso data-from → data-to) y las ciudades se encienden una a una
  (data-at), junto con su punto en la lista de texto. Solo avanza; al terminar todo queda encendido.
  Modo quieto o sin JS: el HTML/CSS por defecto ya lo muestra todo encendido.
*/
export function initArea({ still }) {
  const section = document.querySelector('.area');
  const map = section?.querySelector('.map');
  if (!section || !map || still) return;

  // Cada carretera base (tenue) recibe una copia dorada que se "dibuja" con stroke-dashoffset.
  const roads = [...map.querySelectorAll('.map__road')].map((base) => {
    const lit = base.cloneNode();
    lit.classList.add('map__road--lit');
    base.after(lit);
    const len = lit.getTotalLength();
    lit.style.strokeDasharray = `${len}`;
    lit.style.strokeDashoffset = `${len}`;
    return { el: lit, len, from: +base.dataset.from, to: +base.dataset.to };
  });

  const markers = [...map.querySelectorAll('[data-at]')].map((el) => ({
    el,
    at: +el.dataset.at,
    item: el.dataset.city ? section.querySelector(`.area__city[data-city="${el.dataset.city}"]`) : null,
  }));

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  const render = (p) => {
    for (const r of roads) {
      const t = clamp01((p - r.from) / (r.to - r.from));
      r.el.style.strokeDashoffset = `${r.len * (1 - t)}`;
    }
    for (const m of markers) {
      if (p < m.at || m.el.classList.contains('is-lit')) continue;
      m.el.classList.add('is-lit');
      m.item?.classList.add('is-lit');
    }
  };

  section.classList.add('is-armed');

  oneWayScrub(map, { start: 'clamp(top 75%)', end: 'clamp(bottom 70%)', duration: 0.8 }, render, () => {
    // Estado final = estado por defecto del CSS: se quitan las copias y las marcas temporales.
    section.classList.remove('is-armed');
    roads.forEach((r) => r.el.remove());
  });
}
