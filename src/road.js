import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/*
  Transición "carretera de noche": un haz de faro dorado cruza la sección ligado al scroll y,
  al pasar, "enciende" la lista de servicios (una sola máscara para todo el grupo).
  El encendido va en un solo sentido: una vez encendida, la lista no vuelve a atenuarse.
  Lluvia en canvas: pocas partículas, ≤ 30 fps, en pausa fuera de pantalla o con la pestaña oculta,
  apagada con batería baja. Nada de esto corre en modo quieto (reduced-motion / saveData).
*/

const FRAME_MS = 1000 / 30;
const LIT_SOFT = 14; // ancho (en %) del borde suave de la luz sobre la lista

export function initRoad({ still }) {
  const section = document.querySelector('.road');
  const scene = section?.querySelector('.road__scene');
  const beam = section?.querySelector('.road__beam');
  const list = section?.querySelector('.services__list');
  if (!section || !scene || !beam || !list || still) return;

  // Posición del haz en px (centro, coordenadas de la sección). La lluvia la usa para brillar cerca.
  const state = { beamX: -1e4, shown: 0, target: 0 };

  const setLit = (pct) => list.style.setProperty('--lit', `${pct}%`);

  const render = () => {
    const w = section.clientWidth;
    const bw = beam.offsetWidth;
    // De fuera por la izquierda a fuera por la derecha.
    const x = gsap.utils.interpolate(-bw * 0.6, w + bw * 0.6, state.shown);
    state.beamX = x;
    beam.style.transform = `translate3d(${x - bw / 2}px, 0, 0) skewX(-12deg)`;

    const lr = list.getBoundingClientRect();
    const sr = section.getBoundingClientRect();
    const pct = ((x - (lr.left - sr.left)) / lr.width) * 100;
    setLit(Math.min(pct, 100 + LIT_SOFT * 2));
  };

  setLit(-LIT_SOFT * 2);
  section.classList.add('is-armed');

  let finished = false;
  const st = ScrollTrigger.create({
    trigger: list,
    // clamp(): el final nunca queda más allá del scroll máximo (p. ej. si esta es la última sección).
    start: 'clamp(top 85%)',
    end: 'clamp(bottom 55%)',
    onUpdate(self) {
      if (finished || self.progress <= state.target) return;
      state.target = self.progress;
      gsap.to(state, {
        shown: state.target,
        duration: 0.6,
        ease: 'power2.out',
        overwrite: true,
        onUpdate: render,
        onComplete: () => {
          if (state.target >= 1) finish();
        },
      });
    },
  });

  function finish() {
    finished = true;
    st.kill();
    section.classList.remove('is-armed');
    list.style.removeProperty('--lit');
    state.beamX = -1e4;
  }

  // Si se carga la página ya pasada la sección (recarga a mitad de scroll), la lista queda encendida.
  if (st.progress >= 1) finish();
  else render();

  initRain(scene, state);
}

function initRain(scene, state) {
  const canvas = document.createElement('canvas');
  canvas.className = 'road__rain';
  scene.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let drops = [];
  let raf = 0;
  let last = 0;
  let inView = false;
  let lowBattery = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const makeDrop = (y = rand(0, h)) => ({
    x: rand(-40, w),
    y,
    len: rand(10, 22),
    speed: rand(420, 680), // px/s
    alpha: rand(0.05, 0.16),
  });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = scene.clientWidth;
    h = scene.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Pocas partículas: ~1 por cada 12 000 px², máx. 80.
    const count = Math.min(80, Math.round((w * h) / 12000));
    drops = Array.from({ length: count }, () => makeDrop());
  };

  const SLANT = 0.14; // inclinación de la lluvia (dx por dy)
  const reach = () => Math.max(160, w * 0.2); // radio en que el haz ilumina la lluvia

  const draw = (dt) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    const r = reach();
    for (const d of drops) {
      d.y += d.speed * dt;
      d.x += d.speed * SLANT * dt;
      if (d.y - d.len > h) Object.assign(d, makeDrop(-rand(0, 40)));

      // Cerca del haz la gota se vuelve dorada y más visible.
      const near = Math.max(0, 1 - Math.abs(d.x - state.beamX) / r);
      const a = d.alpha + near * 0.35;
      ctx.strokeStyle =
        near > 0.05 ? `rgba(235, 203, 130, ${a.toFixed(3)})` : `rgba(243, 235, 221, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * SLANT, d.y - d.len);
      ctx.stroke();
    }
  };

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < FRAME_MS) return; // tope de 30 fps
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    draw(dt);
  };

  const shouldRun = () => inView && !document.hidden && !lowBattery;
  const sync = () => {
    if (shouldRun() && !raf) {
      last = 0;
      raf = requestAnimationFrame(tick);
    } else if (!shouldRun() && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    canvas.hidden = lowBattery;
  };

  resize();
  new ResizeObserver(() => {
    resize();
    if (!raf) draw(0);
  }).observe(scene);

  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    sync();
  }).observe(scene);
  document.addEventListener('visibilitychange', sync);

  // Batería baja (≤ 20 % y sin cargar): sin lluvia.
  navigator
    .getBattery?.()
    .then((b) => {
      const check = () => {
        lowBattery = !b.charging && b.level <= 0.2;
        sync();
      };
      check();
      b.addEventListener('levelchange', check);
      b.addEventListener('chargingchange', check);
    })
    .catch(() => {});
}
