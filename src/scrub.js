import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Progreso de scroll (0→1) que solo avanza y se suaviza con un tween: lo que se encendió
 * no vuelve a apagarse al subir. onProgress(p) se llama en cada paso; onDone() una vez al llegar a 1
 * (también de inmediato si la página se carga ya pasada la sección).
 * Usar 'clamp(...)' en start/end para que el final nunca quede más allá del scroll máximo.
 */
export function oneWayScrub(trigger, { start, end, duration = 0.6 }, onProgress, onDone) {
  const state = { shown: 0, target: 0 };
  let done = false;
  let st = null;

  const finish = () => {
    if (done) return;
    done = true;
    st?.kill();
    onDone();
  };

  st = ScrollTrigger.create({
    trigger,
    start,
    end,
    onUpdate(self) {
      if (done || self.progress <= state.target) return;
      state.target = self.progress;
      gsap.to(state, {
        shown: state.target,
        duration,
        ease: 'power2.out',
        overwrite: true,
        onUpdate: () => onProgress(state.shown),
        onComplete: () => {
          if (state.target >= 1) finish();
        },
      });
    },
  });

  if (st.progress >= 1) finish();
  else if (!done) onProgress(0);
}
