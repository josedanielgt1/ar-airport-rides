/*
  Enlaces de mapa para los correos (sin claves ni geocodificación propia).
  - mapsSearchUrl / mapsRouteUrl: abren Google Maps (en el iPhone y Android abren la app de mapas).
  - staticMapUrl: imagen de mapa con las dos marcas (A recogida, B destino) usando la API de Google Static Maps.
    Solo se genera si hay una clave en GOOGLE_MAPS_API_KEY; sin ella, el correo muestra solo los botones.
*/

const enc = encodeURIComponent;

export const mapsSearchUrl = (place) => `https://www.google.com/maps/search/?api=1&query=${enc(place)}`;

export const mapsRouteUrl = (origin, destination) =>
  `https://www.google.com/maps/dir/?api=1&origin=${enc(origin)}&destination=${enc(destination)}&travelmode=driving`;

const DARK_STYLE = [
  'element:geometry|color:0x1a1a1a',
  'element:labels.text.fill|color:0x9c9384',
  'element:labels.text.stroke|color:0x000000',
  'feature:road|element:geometry|color:0x3a3022',
  'feature:road.highway|element:geometry|color:0x6b5c33',
  'feature:water|element:geometry|color:0x0a0a0a',
  'feature:poi|element:labels|visibility:off',
];

/** URL de la imagen del mapa (null si no hay una clave de aspecto válido). */
export function staticMapUrl(origin, destination, key, { width = 600, height = 260 } = {}) {
  if (!key || !/^[\w-]{20,80}$/.test(String(key))) return null;
  const parts = [
    `size=${width}x${height}`,
    'scale=2',
    'maptype=roadmap',
    `markers=${enc(`color:0xC9A24B|label:A|${origin}`)}`,
    `markers=${enc(`color:0xF3EBDD|label:B|${destination}`)}`,
    ...DARK_STYLE.map((s) => `style=${enc(s)}`),
    `key=${enc(key)}`,
  ];
  return `https://maps.googleapis.com/maps/api/staticmap?${parts.join('&')}`;
}
