/*
  Búsqueda de direcciones para el formulario (sugerencias al escribir y dirección de un pin).
  Usa Photon (geocodificador abierto sobre datos de OpenStreetMap, photon.komoot.io). Es un servicio público
  de uso razonable: para tráfico alto conviene cambiar PHOTON por un proveedor con clave (Geoapify, MapTiler…);
  solo hay que adaptar este archivo. Funciones puras + fetch inyectable para poder probarlas sin red.
*/

export const PHOTON = 'https://photon.komoot.io';
export const AUSTIN = { lat: 30.2672, lon: -97.7431 };
const MAX_LABEL = 160; // mismo límite que el campo de dirección

const uniq = (list) => list.filter((v, i) => v && list.indexOf(v) === i);

/** Etiqueta legible de un resultado de Photon: "Hotel Driskill, 604 Brazos St, Austin, Texas". */
export function placeLabel(p = {}) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const head = p.name && p.name !== p.street ? p.name : '';
  const locality = p.city || p.town || p.village || p.district || p.county || '';
  const label = uniq([head, street, locality, p.state]).join(', ');
  return (label || p.country || '').slice(0, MAX_LABEL);
}

/** GeoJSON de Photon → [{ label, lat, lon }] sin duplicados ni resultados sin coordenadas (máx. 5). */
export function parseFeatures(json) {
  const out = [];
  for (const f of Array.isArray(json?.features) ? json.features : []) {
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    const label = placeLabel(f?.properties);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (out.some((o) => o.label === label)) continue;
    out.push({ label, lat, lon });
    if (out.length === 5) break;
  }
  return out;
}

async function getJson(url, { signal, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geo ${res.status}`);
  return res.json();
}

/** Sugerencias para lo que el visitante escribe, sesgadas hacia Austin. */
export async function searchPlaces(query, { signal, fetchImpl, near = AUSTIN } = {}) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (q.length < 3) return [];
  const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${near.lat}&lon=${near.lon}&location_bias_scale=0.4`;
  return parseFeatures(await getJson(url, { signal, fetchImpl }));
}

/** Dirección del punto donde cae un pin; null si no hay nada cerca. */
export async function reversePlace(lat, lon, { signal, fetchImpl } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const url = `${PHOTON}/reverse?lon=${lon}&lat=${lat}&lang=en&limit=1`;
  return parseFeatures(await getJson(url, { signal, fetchImpl }))[0]?.label ?? null;
}

/** Texto de respaldo si el pin no tiene dirección: "30.26720, -97.74310" (Google Maps lo entiende). */
export const coordsLabel = (lat, lon) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
