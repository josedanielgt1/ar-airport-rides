// Páginas legales (/privacy, /terms) y avisos de la página principal (auditoría SEC-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const PAGES = ['privacy/index.html', 'terms/index.html'];

// Texto visible aproximado: sin comentarios HTML (donde viven los TODO) ni etiquetas.
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
const article = (html, lang) => html.match(new RegExp(`<article[^>]*data-legal-lang="${lang}"[\\s\\S]*?</article>`))?.[0] ?? '';
const ids = (html) => [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);

for (const page of PAGES) {
  test(`${page}: noindex, un solo h1 y sin scripts en línea (CSP)`, () => {
    const html = read(page);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length, 0, 'sin <script> en línea');
    assert.match(html, /<script type="module" src="\/src\/legal\.js"><\/script>/);
  });

  test(`${page}: versiones en y es con las mismas secciones`, () => {
    const html = read(page);
    const en = article(html, 'en');
    const es = article(html, 'es');
    assert.ok(en && es, 'faltan los artículos en/es');
    assert.match(en, /lang="en"/);
    assert.match(es, /lang="es"/);
    assert.deepEqual(ids(es), ids(en).map((id) => `es-${id}`));
  });

  test(`${page}: marcado como borrador solo en comentarios, sin afirmar licencias ni seguros`, () => {
    const html = read(page);
    assert.match(html, /TODO\(legal\)/);
    const text = visible(html);
    assert.doesNotMatch(text, /TODO|\[[^\]]*\]/); // sin marcas ni [marcadores] visibles
    assert.doesNotMatch(text, /\b(borrador|draft)\b/i);
    assert.doesNotMatch(text, /\b(licensed|insured|bonded|licenciad|asegurad)/i);
    assert.doesNotMatch(text, /\b(Uber|Lyft)\b/);
    const broken = new RegExp(`${String.fromCharCode(0xfffd)}|${String.fromCharCode(0xc3)}`);
    assert.doesNotMatch(text, broken, 'caracteres dañados (U+FFFD o mojibake)');
  });
}

test('privacidad: cubre ubicación, SMS, cookies y derechos en ambos idiomas', () => {
  const html = read('privacy/index.html');
  for (const id of ['location', 'sms', 'cookies', 'rights', 'retention', 'share']) {
    assert.ok(ids(html).includes(id) && ids(html).includes(`es-${id}`), `falta la sección ${id}`);
  }
  for (const name of ['Vercel', 'Resend', 'Photon', 'OpenStreetMap', 'Google', 'Cloudflare']) {
    assert.match(article(html, 'en'), new RegExp(name));
    assert.match(article(html, 'es'), new RegExp(name));
  }
  assert.match(html, /mailto:@@email@@/, 'el correo sale de src/config.js');
});

test('página principal: enlaces a privacidad y términos, consentimiento y aviso de ubicación', () => {
  const html = read('index.html');
  assert.match(html, /class="site-footer__links"[\s\S]*href="privacy\/"[\s\S]*href="terms\/"/);
  // Consentimiento: casilla obligatoria y SIN marcar (sin `checked`), con enlaces a términos y privacidad.
  assert.match(html, /<input class="check__input" id="f-consent" name="consent" type="checkbox" value="yes" required/);
  assert.doesNotMatch(html, /id="f-consent"[^>]*\bchecked\b/);
  assert.match(html, /class="check__text"[\s\S]*?href="terms\/"[\s\S]*?href="privacy\/"/);
  assert.match(html, /id="maps-notice"[\s\S]*?href="privacy\/#location"/);
});

test('el sitio no usa cookies ni analítica (lo afirma la política)', () => {
  const files = ['index.html', 'src/main.js', 'src/legal.js', 'src/i18n/index.js', 'src/ref.js', 'src/form.js', 'src/places.js'];
  for (const f of files) {
    assert.doesNotMatch(read(f), /document\.cookie|gtag\(|google-analytics|plausible|@vercel\/analytics/i, f);
  }
});
