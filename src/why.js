import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const DIM = 0.38; // opacidad de una promesa antes de que la línea la alcance
const LIGHT = 0.15; // duración (en tramos) del encendido de cada promesa

/*
  Por qué elegirnos: con el scroll (scrub, sin pin) la línea de carretera se dibuja de arriba abajo,
  tramo a tramo (scaleY), y cada promesa pasa de 38 % a 100 % de opacidad cuando la línea llega a su
  punto, que se rellena de dorado. Solo transform y opacity. Modo quieto o sin JS: el CSS ya lo
  muestra todo encendido.
*/
export function initWhy({ still }) {
  const list = document.querySelector('.why__list');
  if (!list || still) return;

  const items = [...list.querySelectorAll('.why__item')];
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: list, start: 'clamp(top 75%)', end: 'clamp(bottom 55%)', scrub: 0.6 },
  });

  items.forEach((item, i) => {
    tl.fromTo(item.querySelectorAll('.why__title, .why__desc'), { opacity: DIM }, { opacity: 1, duration: LIGHT }, i);
    tl.fromTo(item.querySelector('.why__fill'), { opacity: 0 }, { opacity: 1, duration: LIGHT }, i);
    const seg = item.querySelector('.why__seg');
    if (i < items.length - 1 && seg) tl.fromTo(seg, { scaleY: 0 }, { scaleY: 1, duration: 1 }, i);
  });
}
