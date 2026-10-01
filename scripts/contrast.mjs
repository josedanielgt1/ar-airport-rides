// npm run check:contrast — calcula el contraste WCAG 2.x de los pares de color en uso (lee los tokens
// de src/styles/tokens.css) y falla si algún texto queda por debajo de AA.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf-8');
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} no encontrado`);
  return m[1];
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// Color con opacidad sobre un fondo.
const over = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

const C = Object.fromEntries(['c-night', 'c-asphalt', 'c-gold', 'c-beam', 'c-cream', 'c-mist', 'c-alert'].map((n) => [n, rgb(token(n))]));

// [descripción, texto, fondo, mínimo] — 4.5 texto normal, 3 texto grande (≥ 24 px o ≥ 18.7 px en negrita).
const pairs = [
  ['Texto principal (crema sobre negro)', C['c-cream'], C['c-night'], 4.5],
  ['Texto secundario (niebla sobre negro)', C['c-mist'], C['c-night'], 4.5],
  ['Dorado sobre negro (marca, íconos, foco)', C['c-gold'], C['c-night'], 4.5],
  ['Botón: negro sobre dorado', C['c-night'], C['c-gold'], 4.5],
  ['Botón hover: negro sobre faro', C['c-night'], C['c-beam'], 4.5],
  ['Campos: crema sobre asfalto', C['c-cream'], C['c-asphalt'], 4.5],
  ['Errores: alerta sobre negro', C['c-alert'], C['c-night'], 4.5],
  ['Errores: alerta sobre asfalto', C['c-alert'], C['c-asphalt'], 4.5],
  ['Mapa: etiquetas largas (niebla al 85 %)', over(C['c-mist'], 0.85, C['c-night']), C['c-night'], 4.5],
  ['Borde de campos (niebla 70 % sobre negro) — componente, mín. 3:1', over(C['c-mist'], 0.7, C['c-night']), C['c-night'], 3],
  ['Estado tenue antes del encendido (crema 35 %) — transitorio', over(C['c-cream'], 0.35, C['c-night']), C['c-night'], 0],
];

let fail = 0;
const rows = pairs.map(([name, fg, bg, min]) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  return `${ok ? 'OK  ' : 'FAIL'} ${r.toFixed(2).padStart(6)}:1  (mín. ${min || '—'})  ${name}`;
});
console.log(rows.join('\n'));
if (fail) {
  console.error(`\n${fail} par(es) por debajo del mínimo.`);
  process.exit(1);
}
