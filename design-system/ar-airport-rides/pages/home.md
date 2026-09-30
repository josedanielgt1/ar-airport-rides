# Página: home (one-page)

> Solo lo específico de esta página. Los tokens globales están en `../MASTER.md`.

## Orden
Hero → carretera de noche (transición) → servicios (lista) → área de servicio (mapa I-35) → vehículo → por qué elegirnos → reserva → footer.

## Hero
- Fondo `#000`. Video 4:3 (`hero.mp4`, 1280×960) con `object-fit: contain` y bordes con `mask-image`.
- Móvil: video a todo el ancho bajo la marca; el titular sube sobre la franja negra inferior del video.
- Escritorio: video a la derecha; titular a la izquierda, abajo, sobre la zona negra bajo la camioneta.
- Marca (AR + EN|ES) y botón fijo de WhatsApp visibles desde t=0.
- Titular en 3 líneas (SplitText por líneas, `aria` automático → el H1 sigue siendo un solo elemento accesible).
  Línea 1 hacia los 2 s del video, las otras escalonadas; subtítulo al final. Todo visible antes de 4,5 s.
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
`hero-last.jpg` como marcador con TODO(cliente). Amenidades solo si el cliente las confirma.

## Por qué elegirnos
4 frases cortas en serif, sin íconos. Sin afirmar licencia, seguro ni permisos (TODO(cliente)).

## Botón fijo de WhatsApp
Respeta `safe-area-inset-bottom`; no tapa el botón de enviar del formulario (se oculta o se aparta cuando el formulario está en pantalla).
