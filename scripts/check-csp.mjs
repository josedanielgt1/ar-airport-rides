// Verifica que cada <script> en línea de dist/index.html tenga su hash en la CSP de vercel.json.
// Uso: npm run build && npm run check:csp   (con -- --print muestra los hashes para copiarlos).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf-8');
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8'));

const csp =
  config.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`,
);

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
console.log(`check:csp OK — ${hashes.length} scripts en línea cubiertos por la CSP.`);
