import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLabel, parseFeatures, searchPlaces, reversePlace, coordsLabel, AUSTIN } from '../src/lib/geo.js';

const feature = (props, coords = [-97.74, 30.26]) => ({ geometry: { coordinates: coords }, properties: props });

test('placeLabel: nombre, calle con número, ciudad y estado sin repetir', () => {
  assert.equal(
    placeLabel({ name: 'Hotel Driskill', housenumber: '604', street: 'Brazos Street', city: 'Austin', state: 'Texas' }),
    'Hotel Driskill, 604 Brazos Street, Austin, Texas',
  );
  assert.equal(placeLabel({ name: 'Congress Avenue', street: 'Congress Avenue', city: 'Austin', state: 'Texas' }), 'Congress Avenue, Austin, Texas');
  assert.equal(placeLabel({ country: 'United States' }), 'United States');
  assert.equal(placeLabel({}), '');
  assert.ok(placeLabel({ name: 'x'.repeat(500) }).length <= 160);
});

test('parseFeatures: descarta sin coordenadas, duplicados y limita a 5', () => {
  const json = {
    features: [
      feature({ name: 'A', city: 'Austin' }),
      feature({ name: 'A', city: 'Austin' }),
      feature({ name: 'Sin coordenadas' }, []),
      feature({}),
      ...['B', 'C', 'D', 'E', 'F', 'G'].map((n) => feature({ name: n })),
    ],
  };
  const out = parseFeatures(json);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0], { label: 'A, Austin', lat: 30.26, lon: -97.74 });
  assert.deepEqual(parseFeatures(null), []);
  assert.deepEqual(parseFeatures({ features: 'x' }), []);
});

test('searchPlaces: consulta codificada, sesgo hacia Austin, mínimo de caracteres y errores', async () => {
  const urls = [];
  const fetchImpl = async (url) => (urls.push(url), { ok: true, json: async () => ({ features: [feature({ name: 'Hotel Driskill', city: 'Austin' })] }) });
  assert.deepEqual(await searchPlaces('ab', { fetchImpl }), []);
  assert.equal(urls.length, 0, 'no consulta con menos de 3 caracteres');

  const found = await searchPlaces('Hotel & Driskill', { fetchImpl });
  assert.equal(found[0].label, 'Hotel Driskill, Austin');
  assert.ok(urls[0].startsWith('https://photon.komoot.io/api/?q=Hotel%20%26%20Driskill'));
  assert.ok(urls[0].includes(`lat=${AUSTIN.lat}`) && urls[0].includes(`lon=${AUSTIN.lon}`));

  await assert.rejects(searchPlaces('Austin', { fetchImpl: async () => ({ ok: false, status: 429 }) }), /geo 429/);
});

test('reversePlace: dirección del pin, null sin resultados o coordenadas inválidas', async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => (url.includes('lat=30.25') ? { features: [feature({ street: 'Congress Avenue', housenumber: '1', city: 'Austin' })] } : { features: [] }) });
  assert.equal(await reversePlace(30.25, -97.7, { fetchImpl }), '1 Congress Avenue, Austin');
  assert.equal(await reversePlace(10, 10, { fetchImpl }), null);
  assert.equal(await reversePlace(NaN, 1, { fetchImpl }), null);
  assert.equal(coordsLabel(30.2672, -97.7431), '30.26720, -97.74310');
});
