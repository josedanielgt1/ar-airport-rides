import { t, onLangChange } from './i18n/index.js';
import { searchPlaces, reversePlace, coordsLabel, AUSTIN } from './lib/geo.js';
import './styles/places.css';

/*
  Direcciones del formulario, dos maneras (la escritura sigue funcionando sin JS ni red):
  1. Escribir: aparecen sugerencias (combobox accesible, flechas + Enter) sesgadas hacia Austin.
  2. Mapa: botón "Elegir en el mapa" → mapa con un pin de recogida (A) y uno de destino (B). Se toca el mapa
     o se arrastra el pin; la dirección del pin se escribe sola en el campo. El mapa (Leaflet + OpenStreetMap)
     se descarga solo al abrirlo.
*/

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;
const TARGETS = ['origin', 'destination'];
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- Sugerencias al escribir ---------- */

function attachAutocomplete(input, list, status, { onPick, onType }) {
  let items = [];
  let active = -1;
  let timer = 0;
  let controller = null;
  const cache = new Map();

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);

  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const highlight = (i) => {
    active = i;
    [...list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', list.children[i].id);
      list.children[i].scrollIntoView?.({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const render = (next) => {
    items = next;
    list.replaceChildren(
      ...next.map((item, i) => {
        const li = document.createElement('li');
        li.id = `${list.id}-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.className = 'place__option';
        li.textContent = item.label;
        li.addEventListener('click', () => pick(i));
        return li;
      }),
    );
    list.hidden = next.length === 0;
    input.setAttribute('aria-expanded', String(next.length > 0));
    active = -1;
    status.textContent = next.length ? t('form.suggestAvailable') : t('form.suggestEmpty');
  };

  const pick = (i) => {
    const item = items[i];
    if (!item) return;
    input.value = item.label;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true })); // limpia el error del campo
    onPick(item);
  };

  const lookup = async (q) => {
    if (cache.has(q)) return render(cache.get(q));
    controller?.abort();
    controller = new AbortController();
    try {
      const found = await searchPlaces(q, { signal: controller.signal });
      cache.set(q, found);
      if (input.value.trim() === q) render(found);
    } catch (err) {
      if (err?.name !== 'AbortError') close(); // sin red: se sigue escribiendo a mano
    }
  };

  input.addEventListener('input', (e) => {
    if (!e.isTrusted) return; // los cambios hechos por código (pin, sugerencia) no abren la lista
    onType();
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < MIN_CHARS) {
      controller?.abort();
      close();
      return;
    }
    timer = setTimeout(() => lookup(q), DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight((active + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight((active - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('pointerdown', (e) => e.preventDefault()); // no pierde el foco al tocar una opción
}

/* ---------- Mapa con pines ---------- */

export function initPlaces() {
  const form = document.getElementById('reserve-form');
  const field = document.getElementById('mapfield');
  if (!form || !field) return;

  const inputs = Object.fromEntries(TARGETS.map((k) => [k, form.elements.namedItem(k)]));
  const lists = Object.fromEntries(TARGETS.map((k) => [k, document.getElementById(`f-${k}-list`)]));
  const statusEl = document.getElementById('place-status');
  const toggle = field.querySelector('.mapfield__toggle');
  const toggleLabel = toggle.querySelector('span');
  const box = document.getElementById('mapbox');
  const mapEl = document.getElementById('map');
  const mapStatus = document.getElementById('map-status');
  const tabs = [...box.querySelectorAll('.mapbox__tab')];

  const picked = { origin: null, destination: null }; // { lat, lon } de cada punto
  let state = null; // { L, map, markers }
  let activeTarget = 'origin';
  let open = false;
  const ticket = { origin: 0, destination: 0 };

  const setActive = (target) => {
    activeTarget = target;
    tabs.forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.target === target)));
  };

  const renderToggle = () => {
    toggleLabel.textContent = t(open ? 'form.mapToggleHide' : 'form.mapToggle');
    toggle.setAttribute('aria-expanded', String(open));
  };

  const iconFor = (L, target) =>
    L.divIcon({
      className: `pin pin--${target === 'origin' ? 'a' : 'b'}`,
      html: `<span><b>${target === 'origin' ? 'A' : 'B'}</b></span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 41],
    });

  const fit = () => {
    if (!state) return;
    const pts = TARGETS.map((k) => picked[k]).filter(Boolean).map((p) => [p.lat, p.lon]);
    if (!pts.length) return;
    const animate = !reducedMotion();
    if (pts.length === 1) state.map.setView(pts[0], Math.max(state.map.getZoom(), 14), { animate });
    else state.map.fitBounds(pts, { padding: [48, 48], maxZoom: 15, animate });
  };

  const placeMarker = (target, { lat, lon }) => {
    if (!state) return;
    const { L, map, markers } = state;
    if (markers[target]) markers[target].setLatLng([lat, lon]);
    else {
      const marker = L.marker([lat, lon], { draggable: true, icon: iconFor(L, target), keyboard: false, alt: '' }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        pinMoved(target, p.lat, p.lng);
      });
      markers[target] = marker;
    }
  };

  const clearMarker = (target) => {
    if (state?.markers[target]) {
      state.markers[target].remove();
      state.markers[target] = null;
    }
  };

  // El visitante colocó o arrastró un pin: se guarda y se escribe su dirección en el campo.
  const pinMoved = async (target, lat, lon) => {
    picked[target] = { lat, lon };
    placeMarker(target, picked[target]);
    const mine = ++ticket[target];
    mapStatus.textContent = t('form.mapLooking');
    let label = null;
    try {
      label = await reversePlace(lat, lon);
    } catch {
      label = null;
    }
    if (mine !== ticket[target]) return; // llegó un pin más reciente
    inputs[target].value = (label || coordsLabel(lat, lon)).slice(0, 160);
    inputs[target].dispatchEvent(new Event('input', { bubbles: true }));
    mapStatus.textContent = '';
  };

  const ensureMap = async () => {
    if (state) return state;
    const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
    const L = mod.default ?? mod;
    const map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([AUSTIN.lat, AUSTIN.lon], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    state = { L, map, markers: { origin: null, destination: null } };
    map.on('click', (e) => {
      pinMoved(activeTarget, e.latlng.lat, e.latlng.lng);
      if (activeTarget === 'origin' && !picked.destination) setActive('destination'); // siguiente: el destino
    });
    TARGETS.forEach((k) => picked[k] && placeMarker(k, picked[k])); // pines de sugerencias elegidas antes
    return state;
  };

  const setOpen = async (next) => {
    open = next;
    box.hidden = !open;
    renderToggle();
    if (!open) return;
    mapStatus.textContent = '';
    try {
      await ensureMap();
      state.map.invalidateSize();
      fit();
    } catch {
      mapStatus.textContent = t('form.mapError');
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));

  // Mi ubicación: coloca el pin de recogida (A) donde está el visitante. Solo si el navegador lo permite;
  // el permiso lo pide el navegador al tocar el botón (nunca al cargar la página).
  const locate = document.getElementById('locate');
  if (locate && 'geolocation' in navigator) {
    locate.hidden = false;
    locate.addEventListener('click', async () => {
      if (locate.getAttribute('aria-busy') === 'true') return;
      locate.setAttribute('aria-busy', 'true');
      if (!open) await setOpen(true);
      mapStatus.textContent = t('form.locating');
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          setActive('origin');
          if (state) {
            await pinMoved('origin', coords.latitude, coords.longitude);
            state.map.setView([coords.latitude, coords.longitude], 15, { animate: !reducedMotion() });
            if (!picked.destination) setActive('destination');
          }
          locate.removeAttribute('aria-busy');
        },
        (err) => {
          mapStatus.textContent = t(err.code === 1 ? 'form.locateDenied' : 'form.locateError');
          locate.removeAttribute('aria-busy');
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
      );
    });
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => setActive(tab.dataset.target)));

  TARGETS.forEach((target) =>
    attachAutocomplete(inputs[target], lists[target], statusEl, {
      onPick: (item) => {
        picked[target] = { lat: item.lat, lon: item.lon };
        ticket[target]++; // cancela cualquier dirección de pin pendiente
        if (state) {
          placeMarker(target, picked[target]);
          fit();
        }
      },
      onType: () => {
        // Si escribe a mano, el pin anterior ya no corresponde a lo escrito.
        picked[target] = null;
        ticket[target]++;
        clearMarker(target);
      },
    }),
  );

  form.addEventListener('reset', () => {
    TARGETS.forEach((k) => {
      picked[k] = null;
      ticket[k]++;
      clearMarker(k);
    });
    setActive('origin');
  });

  onLangChange(() => {
    renderToggle();
    if (!mapStatus.textContent) return;
    mapStatus.textContent = '';
  });

  setActive('origin');
  renderToggle();
  field.hidden = false; // sin JS el campo y el mapa no existen: queda el formulario de siempre
}
