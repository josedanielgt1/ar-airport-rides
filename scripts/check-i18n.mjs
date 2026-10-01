// npm run check:i18n — falla (exit 1) si en.json y es.json no tienen las mismas claves, si hay textos
// vacíos o de tipo distinto, o si el HTML / JS usan una clave que no existe.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf-8');
const en = JSON.parse(read('src/i18n/en.json'));
const es = JSON.parse(read('src/i18n/es.json'));
const problems = [];

for (const [a, b, an, bn] of [
  [en, es, 'en', 'es'],
  [es, en, 'es', 'en'],
]) {
  for (const k of Object.keys(a)) if (!(k in b)) problems.push(`falta "${k}" en ${bn}.json (existe en ${an}.json)`);
}
for (const k of Object.keys(en)) {
  if (!(k in es)) continue;
  if (Array.isArray(en[k]) !== Array.isArray(es[k])) problems.push(`"${k}": tipo distinto entre en y es`);
  else if (Array.isArray(en[k]) && en[k].length !== es[k].length) problems.push(`"${k}": distinto número de líneas`);
  for (const [lang, v] of [['en', en[k]], ['es', es[k]]]) {
    if ((Array.isArray(v) ? v.join('') : String(v)).trim() === '') problems.push(`"${k}" vacío en ${lang}.json`);
  }
}

// Claves usadas en el HTML.
const html = read('index.html');
const used = new Set();
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="[^:"]+:([^"]+)"/g)) used.add(m[1]);

// Claves usadas en el JS: t('clave') literales.
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
const srcDir = new URL('src', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
for (const file of walk(srcDir)) {
  for (const m of readFileSync(file, 'utf-8').matchAll(/\bt\(\s*'([^']+)'\s*\)/g)) used.add(m[1]);
}

// Códigos de error del validador → form.error.<código>.
const validate = read('src/lib/validate.js');
for (const m of validate.matchAll(/errors\[[^\]]+\]\s*=\s*'([a-zA-Z]+)'|errors\.\w+\s*=\s*'([a-zA-Z]+)'/g)) {
  used.add(`form.error.${m[1] ?? m[2]}`);
}

for (const k of used) if (!(k in en)) problems.push(`clave usada pero inexistente: "${k}"`);

if (problems.length) {
  console.error(`check:i18n — ${problems.length} problema(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check:i18n OK — ${Object.keys(en).length} claves en en/es; ${used.size} claves usadas, todas presentes.`);
