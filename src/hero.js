import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { t, onLangChange } from './i18n/index.js';

gsap.registerPlugin(SplitText);

const VIDEO_SRC = `${import.meta.env.BASE_URL}media/hero.mp4`;
const STILL_POSTER = `${import.meta.env.BASE_URL}media/hero-last.jpg`;

// Tiempos en segundos del video (el clip dura ~5,2 s).
const LINE_AT = 2.0; // primera línea del titular
const LINE_GAP = 0.45; // escalonado entre líneas
const SUB_AT = 3.4; // subtítulo; todo termina hacia 4,2 s
const FALLBACK_MS = 4500; // respaldo si el video no avanza

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
  const sub = document.querySelector('.hero__sub');
  const video = document.querySelector('.hero__video');
  if (!title || !sub || !video) return;

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
      .fromTo(
        split.lines,
        { yPercent: 110 },
        { yPercent: 0, duration: 1.1, ease: 'power3.out', stagger: LINE_GAP },
        LINE_AT,
      )
      .fromTo(
        sub,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' },
        SUB_AT,
      );
  };

  // Al terminar se deshace la separación: el H1 vuelve a ser texto plano (sin máscaras que recalcular).
  function finish() {
    done = true;
    split?.revert();
    split = null;
    tl = null;
  }

  // Revelado inmediato (ended, 4,5 s, fallo de play() o error): salta al primer verso y acelera.
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
      gsap.set([title, sub], { animation: 'none' });
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
    if (video.currentTime >= FALLBACK_MS / 1000) hurryWhenReady();
  });
  video.addEventListener('ended', hurryWhenReady);
  video.addEventListener('error', () => {
    toStill();
    hurryWhenReady();
  });
  setTimeout(hurryWhenReady, FALLBACK_MS);

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
