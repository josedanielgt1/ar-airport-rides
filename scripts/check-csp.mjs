// Verifica que cada <script> en línea de las páginas HTML de dist/ (index, privacy, terms…) tenga su hash
// en la CSP de vercel.json.
// Uso: npm run build && npm run check:csp   (con -- --print muestra los hashes para copiarlos).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8'));

const csp =
  config.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

// Todas las páginas HTML generadas (sin entrar en assets/ ni media/).
const pages = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return ['assets', 'media', 'fonts'].includes(f) ? [] : pages(p);
    return f.endsWith('.html') ? [p] : [];
  });
const files = pages(dist);

const hashes = [
  ...new Set(
    files.flatMap((file) =>
      [...readFileSync(file, 'utf-8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
        (m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`,
      ),
    ),
  ),
];

if (process.argv.includes('--print')) {
  console.log(hashes.join(' '));
  process.exit(0);
}

const missing = hashes.filter((h) => !csp.includes(h));
if (!csp) {
  console.error('check:csp FALLÓ — no hay Content-Security-Policy en vercel.json.');
  process.exit(1);
}
if (missing.length) {
  console.error(`check:csp FALLÓ — hashes sin registrar en vercel.json:\n  ${missing.join('\n  ')}`);
  console.error('Corre `npm run check:csp -- --print` y actualiza script-src.');
  process.exit(1);
}
console.log(`check:csp OK — ${files.length} páginas, ${hashes.length} scripts en línea cubiertos por la CSP.`);
