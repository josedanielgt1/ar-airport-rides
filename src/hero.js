import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { t, onLangChange } from './i18n/index.js';

gsap.registerPlugin(SplitText);

const VIDEO_SRC = `${import.meta.env.BASE_URL}media/hero.mp4`;
const STILL_POSTER = `${import.meta.env.BASE_URL}media/hero-last.jpg`;

// Tiempos en segundos del video. El clip dura 8 s en tres planos: faro (0–2,4 s), emblema (2,4–4,45 s)
// y camioneta completa (desde 4,45 s; la cámara se detiene a los 7,2 s). El titular entra con el tercer plano.
const LINE_AT = 4.7; // primera línea del titular
const LINE_GAP = 0.4; // escalonado entre líneas
const META_AT = 5.85; // subtítulo, luego botón y teléfono (escalonados); todo termina hacia 6,9 s
const META_GAP = 0.18;
const GROUND_AT = 5.6; // línea de carretera dorada (≥ 1280 px) y reflejo
const REVEAL_AT = 6.5; // si el video llega aquí sin terminar el revelado, se acelera
const NOT_STARTED_MS = 4500; // el video no arrancó en 4,5 s: se muestra el texto sin esperarlo
const HARD_CAP_MS = 7500; // tope absoluto: con el video lento o atascado, el texto sale igual

/** Titular como texto + <br>. El espacio antes de cada <br> mantiene el aria-label legible. */
function setTitle(el, lines) {
  const nodes = [];
  lines.forEach((line, i) => {
    if (i) nodes.push(document.createElement('br'));
    nodes.push(document.createTextNode(i < lines.length - 1 ? `${line} ` : line));
  });
  el.replaceChildren(...nodes);
}

export function initHero({ still }) {
  const title = document.querySelector('.hero__title');
  const meta = document.querySelector('.hero__meta');
  const glow = document.querySelector('.hero__glow');
  const ground = document.querySelector('.hero__ground');
  const metaItems = meta ? [...meta.children] : [];
  const video = document.querySelector('.hero__video');
  if (!title || !meta || !video) return;

  setTitle(title, t('hero.title'));

  if (still) {
    // Sin video ni animación: poster final y texto visible desde el inicio.
    onLangChange(() => setTitle(title, t('hero.title')));
    return;
  }

  let split = null;
  let tl = null;
  let done = false;
  let hurried = false;

  const build = () => {
    split = SplitText.create(title, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'hero__line',
      aria: 'auto',
    });
    tl = gsap
      .timeline({ paused: true, onComplete: finish })
      // Titular por líneas: sube desde su máscara con un leve fundido (sin letra por letra).
      .fromTo(
        split.lines,
        { yPercent: 105, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: 1.15, ease: 'power3.out', stagger: LINE_GAP },
        LINE_AT,
      )
      .set(meta, { autoAlpha: 1 }, META_AT)
      // Subtítulo, luego botón, luego teléfono.
      .fromTo(
        metaItems,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.75, ease: 'power2.out', stagger: META_GAP },
        META_AT,
      )
      .fromTo(glow, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.0, ease: 'none' }, GROUND_AT)
      // Línea de carretera: se dibuja desde las ruedas hacia los extremos.
      .fromTo(
        ground,
        { autoAlpha: 0, scaleX: 0.15 },
        { autoAlpha: 1, scaleX: 1, duration: 1.4, ease: 'power2.inOut' },
        GROUND_AT,
      );
  };

  // Al terminar se deshace la separación: el H1 vuelve a ser texto plano (sin máscaras que recalcular).
  function finish() {
    done = true;
    split?.revert();
    split = null;
    tl = null;
  }

  // Revelado inmediato (ended, video en 6,5 s, sin arrancar a los 4,5 s, tope de 7,5 s, fallo de play()
  // o error): salta al primer verso y acelera.
  const hurry = () => {
    if (done || hurried || !tl) return;
    hurried = true;
    if (tl.time() < LINE_AT) tl.time(LINE_AT);
    tl.timeScale(1.8).play();
  };

  const toStill = () => {
    video.querySelector('source')?.remove();
    video.removeAttribute('src');
    video.poster = STILL_POSTER;
    video.load();
  };

  // Mientras se decide el titular, CSS lo oculta (con un respaldo propio a los 6 s si este JS no llega).
  // Se espera a la fuente de títulos para medir las líneas con la tipografía real.
  const fontsReady = Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, 1500)),
  ]);

  let started = false;
  const pending = new Promise((resolve) => {
    fontsReady.then(() => {
      build();
      gsap.set([title, meta, glow, ground].filter(Boolean), { animation: 'none' });
      gsap.set(title, { visibility: 'visible' });
      resolve();
    });
  });

  // El timeline sigue al video: arranca en el tiempo actual del clip.
  const sync = () => {
    if (hurried || done) return;
    started = true;
    pending.then(() => {
      if (!hurried && !done) tl.play(video.currentTime);
    });
  };
  const hurryWhenReady = () => pending.then(hurry);

  video.addEventListener('playing', sync, { once: true });
  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= REVEAL_AT) hurryWhenReady();
  });
  video.addEventListener('ended', hurryWhenReady);
  video.addEventListener('error', () => {
    toStill();
    hurryWhenReady();
  });
  // Respaldo: si el video no arrancó a los 4,5 s, el texto no lo espera; y nunca más de 7,5 s en total.
  setTimeout(() => {
    if (!started) hurryWhenReady();
  }, NOT_STARTED_MS);
  setTimeout(hurryWhenReady, HARD_CAP_MS);

  // Cargar el video solo aquí (modo con movimiento). Sin loop: se queda en el último frame.
  const source = document.createElement('source');
  source.src = VIDEO_SRC;
  source.type = 'video/mp4';
  source.addEventListener('error', () => {
    toStill();
    hurryWhenReady();
  });
  video.muted = true;
  video.preload = 'auto';
  video.append(source);
  video.play()?.catch(() => {
    if (!started) toStill();
    hurryWhenReady();
  });

  // Cambio de idioma: revert(), texto nuevo y volver a separar en el mismo punto del timeline.
  onLangChange(() => {
    const lines = t('hero.title');
    if (!split) {
      setTitle(title, lines);
      return;
    }
    const time = tl.time();
    const playing = tl.isActive();
    const speed = tl.timeScale();
    tl.kill();
    split.revert();
    setTitle(title, lines);
    build();
    tl.time(time);
    if (playing) tl.timeScale(speed).play();
  });
}
