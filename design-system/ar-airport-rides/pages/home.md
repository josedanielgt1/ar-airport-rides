# Página: home (one-page)

> Solo lo específico de esta página. Los tokens globales están en `../MASTER.md`.

## Orden
Hero → carretera de noche (transición) → servicios (lista) → área de servicio (mapa I-35) → vehículo → por qué elegirnos → reserva → footer.

## Hero
- Fondo `#000`. Video 4:3 (`hero.mp4`, 1280×960) con `object-fit: contain` y bordes con `mask-image`.
- Móvil: video a todo el ancho bajo la marca; el titular sube sobre la franja negra inferior del video.
- Escritorio: camioneta grande (~28 % más que la v1), con la base de las ruedas apoyada sobre el bloque del titular y la parte trasera alineada al margen de EN|ES. Reflejo dorado muy sutil bajo las ruedas (degradados radiales, sin recuadro).
- Marca (AR + EN|ES) visible desde t=0 en un header fijo. Botón de WhatsApp y teléfono "737-529-1720 · 24/7" junto al subtítulo (aparecen con él).
- Escritorio ≥ 1280 px: titular izquierda / camioneta derecha (~50 vw, `clamp(36rem, 50vw, 62rem)`), ruedas en la línea base del último renglón (2,913 × fs desde el top del titular, medido), línea de carretera de 1 px (dorado 22 %, desvanecida) y resplandor radial < 10 %, estático. Alto máximo 860 px.
- Escritorio 1024–1279 px: camioneta grande sobre el titular. Viñeta elíptica en la máscara para suavizar el fondo de ciudad a mitad del clip.
- Titular en 3 líneas (SplitText por líneas, `aria` automático → el H1 sigue siendo un solo elemento accesible).
  Línea 1 hacia los 2 s del video, las otras escalonadas; subtítulo + botón + reflejo al final. Todo visible antes de 4,5 s.
- Respaldo del revelado: `ended`, 4,5 s, fallo de `play()` o `error` — lo que ocurra primero. Sin JS: todo visible.
- Reduced-motion o saveData: no se carga el video, se muestra `hero-last.jpg`, texto visible desde el inicio.
- Al cambiar EN|ES: `revert()` y volver a separar el titular sin salto de layout.

## Carretera de noche
Barrido de faro dorado ligado al scroll + lluvia en canvas ligero. Al pasar, el haz "enciende" la lista de servicios (un solo revelado de grupo).

## Servicios
Lista (no tarjetas): fila = ícono SVG + nombre + una línea. Datos en `src/data/services.json`. Sin hover por fila.

## Área de servicio
Diagrama esquemático, rotulado "not to scale": la I-35 como columna con Georgetown, Austin y San Marcos sobre ella;
Cedar Park, Pflugerville y Manor fuera de la I-35 con los ramales que correspondan, sin inventar rutas (TODO(cliente) revisar).
AUS con avión SVG. Larga distancia como flechas al borde (TODO(cliente)). Ciudades desde `src/data/service-area.json`
y también como lista de texto. Con reduced-motion todo aparece encendido.

## Vehículo
`hero-last.jpg` tal cual (WebP 640/1280 + JPG, recorte 16:10 sin tocar la camioneta) con TODO(cliente). Amenidades en `amenities.json`, solo las `confirmed: true`.

## Por qué elegirnos
Escritorio: título sticky a la izquierda; a la derecha 4 promesas sobre una "línea de carretera" vertical (1 px, dorado 40 %) con un punto de 8 px por promesa. Título de cada promesa en Cormorant Garamond cursiva 500 (~2rem, 1.75rem en móvil; woff2 propio, sin precarga) + una línea en Manrope niebla. Sin tarjetas, íconos, numeración ni mayúsculas.
Scroll (scrub, sin pin, `src/why.js`): la línea se dibuja por tramos (`scaleY`) y cada promesa pasa de 38 % a 100 % de opacidad al alcanzarla; el punto se rellena (opacidad). Sin JS / reduced-motion / saveData: todo encendido.
Cierre en Manrope + botón "Book a ride" → #reserve. Textos con TODO(cliente). Sin licencia, seguro, permisos ni estadísticas.

## Reserva
Encabezado sticky en escritorio; formulario de hasta 46rem, 2 columnas desde 640 px. Etiquetas visibles, error bajo cada campo (color alerta), estado en aria-live, foco al primer error. Resultado con borde dorado a la izquierda y botón grande "Continue on WhatsApp".

## Footer
Marca, "24/7 Reservations", teléfono, correo y WhatsApp (enlaces ≥ 44 px), pagos solo como texto, ©.

## Botón de WhatsApp fuera del hero
Escritorio: en el header fijo. Móvil/tablet: barra inferior a todo el ancho; el body reserva su alto. Aparece solo cuando el botón del hero sale de pantalla y se aparta mientras el formulario está visible. Respeta `safe-area-inset-bottom`; no tapa el botón de enviar del formulario (se oculta o se aparta cuando el formulario está en pantalla).
