/*
  Vehículo y placa en el correo de confirmación al pasajero ("Your ride: Black Ford Expedition XLT · Texas plate XYC 0931").
  - Por defecto: descripción de src/config.js (VEHICLE_DEFAULT, en el idioma del pasajero) o VEHICLE_DESCRIPTION si
    existe; placa SOLO desde la variable de entorno VEHICLE_PLATE (nunca en el repo).
  - El chofer los ve prellenados en /api/confirm y puede cambiarlos (o vaciarlos) antes de enviar. Vacío = la parte
    se omite; si ambos quedan vacíos no hay línea de vehículo.
  - Solo servidor. Validación estricta (una línea, sin HTML, longitud máxima) y SIEMPRE escapado al renderizar.
*/
import { VEHICLE_DEFAULT } from '../config.js';

export const VEHICLE_MAX = { description: 60, plate: 12 };

// Letras (con tildes), números, espacios y puntuación simple. Sin < > " ` = ; { } ni saltos de línea.
const DESCRIPTION_OK = /^[\p{L}\p{M}\p{N} .,'’&()/#+-]*$/u;
const PLATE_OK = /^[A-Z0-9 -]*$/;

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

const langOf = (lang) => (lang === 'es' ? 'es' : 'en');

/**
 * Valores por defecto para el idioma del pasajero: { description, plate }.
 * Una variable de entorno inválida se ignora (nunca rompe la página ni el correo).
 */
export function vehicleDefaults(env = {}, lang = 'en') {
  const fromEnv = cleanDescription(env.VEHICLE_DESCRIPTION);
  const description = fromEnv.value && !fromEnv.error ? fromEnv.value : VEHICLE_DEFAULT[langOf(lang)];
  const plate = cleanPlate(env.VEHICLE_PLATE);
  return { description, plate: plate.error ? '' : plate.value };
}

/**
 * Vehículo enviado por el formulario del chofer: { vehicle: { description, plate }, error? }.
 * Si un campo NO viene en el formulario (página vieja en caché) se usa el valor por defecto; si viene vacío,
 * se respeta (esa parte se omite en el correo).
 */
export function vehicleFromForm(body = {}, env = {}, lang = 'en') {
  const defaults = vehicleDefaults(env, lang);
  const d = body.vehicle === undefined ? { value: defaults.description } : cleanDescription(body.vehicle);
  const p = body.plate === undefined ? { value: defaults.plate } : cleanPlate(body.plate);
  const vehicle = { description: d.value, plate: p.value };
  const error = d.error || p.error;
  return error ? { vehicle, error } : { vehicle };
}

export const VEHICLE_COPY = {
  en: { label: 'Your ride', plate: `${VEHICLE_DEFAULT.plateState} plate` },
  es: { label: 'Tu vehículo', plate: `placa de ${VEHICLE_DEFAULT.plateState}` },
};

/** "Black Ford Expedition XLT · Texas plate XYC 0931" (o solo una parte), o '' si no hay nada que mostrar. */
export function vehicleText(vehicle = {}, lang = 'en') {
  const t = VEHICLE_COPY[langOf(lang)];
  return [vehicle.description, vehicle.plate && `${t.plate} ${vehicle.plate}`].filter(Boolean).join(' · ');
}
