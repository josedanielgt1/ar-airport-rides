/*
  Vehículo, placa y conductor en el correo de confirmación al pasajero ("Your ride: Black Ford Expedition XLT · Texas
  plate XYC 0931" + "Your chauffeur: Abraham Rojas").
  - Por defecto: descripción de src/config.js (VEHICLE_DEFAULT, en el idioma del pasajero) o VEHICLE_DESCRIPTION si
    existe; placa SOLO desde la variable de entorno VEHICLE_PLATE (nunca en el repo); conductor de
    DRIVER_DEFAULT_NAME (src/config.js) o DRIVER_NAME si existe.
  - El chofer los ve prellenados en /api/confirm y puede cambiarlos (o vaciarlos) antes de enviar. Vacío = la parte
    se omite; sin descripción ni placa no hay línea de vehículo; sin conductor no hay línea de conductor.
  - Miniatura (vehiclePhoto): SOLO si la descripción final es la predeterminada vigente. Si el chofer cambia el
    vehículo, no hay foto (nunca la foto de un carro que no es el que va).
  - Solo servidor. Validación estricta (una línea, sin HTML, longitud máxima) y SIEMPRE escapado al renderizar.
*/
import { DRIVER_DEFAULT_NAME, EMAIL_VEHICLE_PHOTO, VEHICLE_DEFAULT } from '../config.js';
import { siteUrl } from './token.js';

export const VEHICLE_MAX = { description: 60, plate: 12, driver: 60 };

// Letras (con tildes), números, espacios y puntuación simple. Sin < > " ` = ; { } ni saltos de línea.
const DESCRIPTION_OK = /^[\p{L}\p{M}\p{N} .,'’&()/#+-]*$/u;
const PLATE_OK = /^[A-Z0-9 -]*$/;
// Nombre del conductor: letras (con tildes, ñ), espacios y . ' -
const DRIVER_OK = /^[\p{L}\p{M} .'’-]*$/u;

/** Texto a una línea: sin caracteres de control ni separadores de línea, espacios colapsados. */
const oneLine = (v) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Descripción del vehículo → { value } o { error }. Vacío es válido (= se omite). */
export function cleanDescription(input) {
  const value = oneLine(input);
  if (value.length > VEHICLE_MAX.description) return { value, error: `Vehicle: ${VEHICLE_MAX.description} characters max.` };
  if (!DESCRIPTION_OK.test(value)) return { value, error: 'Vehicle: use letters, numbers and simple punctuation only.' };
  return { value };
}

/** Placa → mayúsculas, "XYC0931" → "XYC 0931". Devuelve { value } o { error }. Vacío es válido. */
export function cleanPlate(input) {
  let value = oneLine(input).toUpperCase().replace(/\s*-\s*/g, '-');
  if (/^[A-Z]{3}\d{4}$/.test(value)) value = `${value.slice(0, 3)} ${value.slice(3)}`;
  if (value.length > VEHICLE_MAX.plate) return { value, error: `Plate: ${VEHICLE_MAX.plate} characters max.` };
  if (!PLATE_OK.test(value)) return { value, error: 'Plate: use letters, numbers, spaces or dashes only.' };
  return { value };
}

/** Nombre del conductor → { value } o { error }. Vacío es válido (= se omite). */
export function cleanDriver(input) {
  const value = oneLine(input);
  if (value.length > VEHICLE_MAX.driver) return { value, error: `Driver: ${VEHICLE_MAX.driver} characters max.` };
  if (!DRIVER_OK.test(value)) return { value, error: 'Driver: use letters, spaces and . \' - only.' };
  return { value };
}

const langOf = (lang) => (lang === 'es' ? 'es' : 'en');

/**
 * Valores por defecto para el idioma del pasajero: { description, plate, driver }.
 * Una variable de entorno inválida se ignora (nunca rompe la página ni el correo).
 */
export function vehicleDefaults(env = {}, lang = 'en') {
  const fromEnv = cleanDescription(env.VEHICLE_DESCRIPTION);
  const description = fromEnv.value && !fromEnv.error ? fromEnv.value : VEHICLE_DEFAULT[langOf(lang)];
  const plate = cleanPlate(env.VEHICLE_PLATE);
  const driverEnv = cleanDriver(env.DRIVER_NAME);
  const driver = driverEnv.value && !driverEnv.error ? driverEnv.value : DRIVER_DEFAULT_NAME;
  return { description, plate: plate.error ? '' : plate.value, driver };
}

/**
 * Vehículo enviado por el formulario del chofer: { vehicle: { description, plate, driver }, error? }.
 * Si un campo NO viene en el formulario (página vieja en caché) se usa el valor por defecto; si viene vacío,
 * se respeta (esa parte se omite en el correo).
 */
export function vehicleFromForm(body = {}, env = {}, lang = 'en') {
  const defaults = vehicleDefaults(env, lang);
  const d = body.vehicle === undefined ? { value: defaults.description } : cleanDescription(body.vehicle);
  const p = body.plate === undefined ? { value: defaults.plate } : cleanPlate(body.plate);
  const n = body.driver === undefined ? { value: defaults.driver } : cleanDriver(body.driver);
  const vehicle = { description: d.value, plate: p.value, driver: n.value };
  const error = d.error || p.error || n.error;
  return error ? { vehicle, error } : { vehicle };
}

export const VEHICLE_COPY = {
  en: { label: 'Your ride', plate: `${VEHICLE_DEFAULT.plateState} plate`, driver: 'Your chauffeur', photoAlt: `${VEHICLE_DEFAULT.en}, front view` },
  es: { label: 'Tu vehículo', plate: `placa de ${VEHICLE_DEFAULT.plateState}`, driver: 'Tu conductor', photoAlt: `${VEHICLE_DEFAULT.es}, vista frontal` },
};

/** "Black Ford Expedition XLT · Texas plate XYC 0931" (o solo una parte), o '' si no hay nada que mostrar. */
export function vehicleText(vehicle = {}, lang = 'en') {
  const t = VEHICLE_COPY[langOf(lang)];
  return [vehicle.description, vehicle.plate && `${t.plate} ${vehicle.plate}`].filter(Boolean).join(' · ');
}

/** Normaliza para comparar descripciones: minúsculas y espacios colapsados. */
const norm = (s) => oneLine(s).toLowerCase();

/**
 * true si la descripción final coincide con la predeterminada vigente (VEHICLE_DESCRIPTION si es válida; si no,
 * la de config en el idioma del pasajero). La placa no influye.
 */
export function isDefaultVehicle(vehicle = {}, env = {}, lang = 'en') {
  const current = norm(vehicle.description);
  return Boolean(current) && current === norm(vehicleDefaults(env, lang).description);
}

/**
 * Miniatura del vehículo para el boleto del correo: { src, width, height, alt } o null.
 * Solo con el vehículo predeterminado y con una dirección https del sitio (en un correo, http://localhost sería
 * una imagen rota). Nunca una URL rota ni la foto de otro carro.
 */
export function vehiclePhoto(vehicle, env = {}, lang = 'en') {
  if (!vehicle || !isDefaultVehicle(vehicle, env, lang)) return null;
  const base = siteUrl(env);
  if (!base || !base.startsWith('https://')) return null;
  const { path, width, height } = EMAIL_VEHICLE_PHOTO;
  return { src: `${base}${path}`, width, height, alt: VEHICLE_COPY[langOf(lang)].photoAlt };
}
