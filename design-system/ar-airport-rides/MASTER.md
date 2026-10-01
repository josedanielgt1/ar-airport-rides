# Design System — AR Airport Rides (MASTER)

> Fuente de verdad global. Si existe `pages/<pagina>.md`, sus reglas tienen prioridad sobre este archivo.
> Reescrito a mano el 2026-09-29 con el plan aprobado. Reemplaza la salida automática de ui-ux-pro-max
> (estilo "Liquid Glass", paleta clara y snippet Flip, que no correspondían al proyecto).

**Concepto:** noche de lluvia en carretera — faros, asfalto mojado, luces de ciudad a lo largo de la I-35.
**Stack:** Vite + JS vanilla + CSS, GSAP 3.15 (ScrollTrigger, SplitText). Sin Tailwind ni framework.
**Dials de referencia:** variance 6 · motion 8 (solo en 3 momentos) · density 3 (espacioso).

---

## Color

| Token | Nombre | Hex | Uso |
|---|---|---|---|
| `--c-night` | Noche | `#000000` | Fondo de toda la página (bordes del video medidos: `#000` exacto) |
| `--c-asphalt` | Asfalto | `#15130F` | Campos de formulario y superficies elevadas. Nada más |
| `--c-gold` | Champagne | `#C9A24B` | CTA, luces del mapa, anillo de foco. 8,7:1 sobre negro |
| `--c-beam` | Faro | `#EBCB82` | Solo el punto más brillante del barrido de luz y del brillo de botones |
| `--c-cream` | Crema | `#F3EBDD` | Texto principal. ~17:1 sobre negro |
| `--c-mist` | Niebla | `#9C9384` | Texto secundario. 6,9:1 sobre negro |
| `--c-alert` | Alerta | `#E8917F` | Solo errores del formulario. 8,8:1 sobre negro, 7,8:1 sobre asfalto |

- El dorado nunca va en párrafos largos ni como degradado sobre texto.
- Texto sobre botón dorado: `--c-night` (8,7:1).
- Sin sombras grises tipo tarjeta. La profundidad viene de la luz (dorado difuso), no de sombras.

## Tipografía

| Rol | Familia | Pesos | Notas |
|---|---|---|---|
| Titulares | Cormorant Garamond (variable, woff2 latin, local) | 400 / 500 | Nunca 300 en móvil. Tracking −0.01em en tamaños grandes |
| Texto e interfaz | Manrope (variable, woff2 latin, local) | 400 / 600 | Botones, formulario, navegación |

- Archivos en `public/fonts/`. `font-display: swap`. Precargar solo Cormorant Garamond.
- Escala 1.333 (cuarta justa), base 16 px (1 rem):
  `--fs-sm 0.875rem` · `--fs-base 1rem` · `--fs-md 1.333rem` · `--fs-lg 1.777rem` · `--fs-xl 2.369rem` · `--fs-2xl 3.157rem` · `--fs-hero clamp(2.75rem, min(1.9rem + 3.6vw, 8svh), 5rem)`.
- Interlineado: titulares 1.02–1.1; texto sans 1.55; líneas ≤ 65 caracteres.
- Todo en minúscula normal (sentence case). Sin etiquetas en mayúsculas, sin rótulos encima de cada título,
  sin resaltar una sola palabra del titular, sin "→" pegado a botones.

## Espacio

Escala espaciosa: `--s-1 0.5rem` · `--s-2 1rem` · `--s-3 1.5rem` · `--s-4 2rem` · `--s-5 3rem` · `--s-6 4rem` · `--s-7 6rem` · `--s-8 9rem`.
Margen lateral: `clamp(1.25rem, 5vw, 6rem)`. Contenedor de secciones `--content-max: 110rem` (su borde coincide con el del header hasta ~1950 px). Contenido alineado a la izquierda.

## Forma

- Radio: botones en píldora (`999px`); campos `6px`. Nada más lleva radio.
- Bordes de campos: niebla al 70 % (3,7:1, cumple WCAG 1.4.11).
- Íconos: SVG propios de trazo fino (1.25–1.5 px), `currentColor`, `aria-hidden` si son decorativos. Nunca emojis.

## Movimiento

- La audacia se gasta en 3 momentos: (1) revelado del hero, (2) transición "carretera de noche", (3) mapa que se enciende.
  El resto de la página queda quieto, salvo respuestas a acciones del usuario.
- Curvas: `power3.out` para entradas, `power2.inOut` para barridos; 150–250 ms en estados de interacción.
- Prohibido: fade-and-slide-up en cada sección, hover en cada tarjeta, numeración 01/02/03 si no es secuencia, cursor con glow.
- `prefers-reduced-motion` y `saveData`: sin video (se muestra `hero-last.jpg`), sin lluvia, sin scroll-scrub; todo en su estado final.
- Sin grano de película (se quitó: aclaraba el negro puro). Lluvia: pocas partículas, ≤ 30 fps, en pausa fuera de pantalla y con batería baja; sin tinte dorado.

## Calidad (no negociable)

- Contraste AA, foco visible (anillo `--c-gold` de 2 px con offset), objetivos táctiles ≥ 44 px.
- CLS < 0.1: reservar el espacio de video e imágenes con `aspect-ratio`.
- Mobile-first: revisar en 390 px y 1440 px. Sin scroll horizontal.
- Peso inicial sin video ≤ 1.5 MB.
- Elementos fijos respetan `env(safe-area-inset-*)` y no tapan acciones.
