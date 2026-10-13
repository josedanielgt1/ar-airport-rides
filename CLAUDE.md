# AR Airport Rides — Sitio web premium (semi privado)

Página one-page para un conductor de traslados privados premium en Austin, TX. Los clientes llegan por una tarjeta con QR y contratan directo por WhatsApp o formulario. Sin base de datos.

## Marca
- Nombre: **AR Airport Rides** ("Reliable & Punctual Transfers").
- Estilo: lujo sobrio, negro y dorado, mucho espacio, tipografía elegante. Menos es más.
- Colores base: fondo `#000` en toda la página (bordes del video medidos: `#000` exacto), dorado champagne `#C9A24B`, texto crema `#F3EBDD`. Tokens completos en `design-system/ar-airport-rides/MASTER.md`.
- Tipografías: Cormorant Garamond 400/500 para títulos (nunca 300 en móvil) + Manrope 400/600 para texto. Alojadas en `public/fonts/` (woff2, latin, `font-display: swap`); solo se precarga la de títulos.
- Logo: monograma "AR" con flecha de avión (viene de la tarjeta). Hasta tener el SVG, usar wordmark de texto. El emblema del ancla es secundario u opcional.
- Nunca mencionar Uber, Lyft ni usar sus marcas.
- No afirmar "licensed", "insured", "permitted" ni similares salvo que el cliente lo confirme. Licencias, seguro y permisos son responsabilidad del cliente.

## Mensaje y textos
- El nombre dice "Airport", pero el servicio es mucho más amplio. El hero debe comunicar traslados por toda el área de Austin, con el aeropuerto como un servicio más.
- Hero EN: "Arrive refreshed. On time. Every time." + "Premium private rides across Austin & Central Texas."
- Hero ES: "Llega descansado. A tiempo. Siempre." + "Traslados privados premium en Austin y el centro de Texas."
- Frases cortas, tono sobrio. Nada de párrafos largos.

## Área de servicio
- **Confirmadas:** Austin, Cedar Park, Pflugerville, Manor, Georgetown, San Marcos.
- **Por confirmar con el cliente antes de publicar:** Round Rock, Leander, Lakeway, Bee Cave, Dripping Springs, Buda, Kyle, Hutto.
- **Larga distancia bajo pedido (viene de la tarjeta, confirmar):** San Antonio, Houston, Dallas y sus aeropuertos (SAT, IAH/HOU, DFW/DAL).
- Guardar las ciudades en un solo archivo de datos editable (`src/data/service-area.json`), no escritas a mano en el HTML.

## Servicios (lista editable en un solo archivo de datos)
- Traslados punto a punto por la ciudad y suburbios.
- Aeropuerto AUS (recogida y entrega). Seguimiento de vuelo: **confirmar con el cliente** antes de prometerlo.
- Puerta a puerta.
- Eventos y temporada de eventos de Austin.
- Corporativo y ejecutivos.
- Por horas / chofer a disposición.
- Otros (bodas, tours) solo si el cliente lo confirma.

## Datos de contacto (visibles, así lo quiere el cliente)
- Teléfono: 737-529-1720
- Correo: abrahandrojasm@gmail.com (puede cambiar a correo con dominio propio más adelante; dejarlo en config)
- "24/7 Reservations"
- Pagos (Venmo, Cash App, Zelle): NO se muestran en el sitio. Viven en variables de entorno (`PAY_VENMO_URL`, `PAY_CASHAPP_URL`, `PAY_ZELLE`) y solo salen en el correo de la reserva al chofer, con botones "Email / Text payment details" que abren un mensaje de confirmación en el idioma del pasajero (la tarifa `[FARE]` la escribe el chofer). El correo del pasajero es opcional en el formulario; con él, el correo al chofer lleva `reply_to`.
- Número de WhatsApp: **pendiente de confirmar** (puede ser el mismo teléfono). Guardarlo en config.

## Estructura de la página (una sola página, scroll cinematográfico)
1. **Hero:** video de fondo + título + subtítulo con botón "Reserve on WhatsApp" y el teléfono "737-529-1720 · 24/7" (enlace tel:) al lado. Al salir del hero, el botón de WhatsApp pasa al header fijo (escritorio ≥ 1024 px) o a una barra inferior (móvil/tablet, con safe-area; se aparta mientras el formulario está en pantalla). Escritorio ≥ 1280 px: titular a la izquierda, camioneta a la derecha (~50 % del ancho) con la línea de las ruedas en la línea base del último renglón, línea de carretera dorada de 1 px y resplandor radial estático; alto máximo del hero 860 px.
2. **Servicios:** lista (no tarjetas) que se "enciende" al pasar el barrido de luz de la transición "carretera de noche". Un solo revelado de grupo, sin hover por fila.
3. **Área de servicio:** diagrama esquemático (no a escala) de la I-35 con US 183, SH 130, US 290 y SH 71, ciudades que se encienden con el scroll y lista en texto. En escritorio, título y lista quedan sticky. Etiquetas del mapa ≥ 12 px reales en móvil.
4. **Vehículo:** `public/media/vehicle-front.webp` + `.jpg` de respaldo (hoy: foto de referencia "23 Ford Expedition Limited", HJUdall, CC0, Wikimedia Commons; crédito en el footer desde `src/data/credits.json`; viñeta oscura porque el fondo no es negro; TODO(cliente): fotos propias) y texto "full-size luxury SUV with room for you and your luggage". Amenidades en `src/data/amenities.json` con `confirmed`: solo se muestran las `true` (hoy ninguna).
5. **Por qué elegirnos:** 3 o 4 puntos cortos (puntualidad, privacidad, trato, experiencia).
6. **Reserva:** formulario.
7. **Footer:** teléfono, correo, WhatsApp (los pagos ya no van aquí).

## Formulario de reserva
- Campos: nombre, teléfono, correo (opcional), tipo de servicio, fecha, hora, origen, destino, pasajeros, notas (opcional).
- Al enviar: (a) POST a `/api/reserve` que manda el correo al cliente, y (b) abre un enlace `https://wa.me/<numero>?text=<mensaje prellenado>` en el idioma actual del visitante. Sin API de WhatsApp.
- El correo llega siempre en formato fijo en inglés e indica el idioma del visitante.
- Validación en cliente y servidor, campo honeypot anti-spam y límite básico de envíos.
- Estado de éxito y de error claros. El botón de WhatsApp funciona aunque falle el correo.

## Stack sugerido (puedes proponer cambios y justificarlos)
- Vite + JavaScript vanilla (sin framework), CSS moderno, **GSAP + ScrollTrigger** para las transiciones.
- Función serverless `api/reserve.js` en Vercel con **Resend** para el correo (o Formspree si es más simple).
- Deploy: Vercel o Netlify conectado al repo de GitHub.
- Nota: para pruebas, el remitente por defecto de Resend solo entrega al correo del dueño de la cuenta. Para producción hay que verificar un dominio.

## Idiomas (EN por defecto, toggle EN | ES)
- Textos en `src/i18n/en.json` y `src/i18n/es.json`, marcados con `data-i18n`.
- Primera visita: detectar idioma del navegador. Guardar la elección en `localStorage` dentro de try/catch.
- Actualizar `<html lang>` al cambiar. Mensaje de WhatsApp en el idioma activo.
- Agregar `hreflang` solo si luego se decide indexar la página.

## Página semi privada
- `<meta name="robots" content="noindex, nofollow">` y cabecera `X-Robots-Tag: noindex` en `vercel.json`.
- `robots.txt` con `Disallow: /`. Sin sitemap.
- Ruta corta `/r` que redirige a `/?ref=card` (para el QR de la tarjeta). El QR apunta siempre a esa ruta corta, nunca a la página final.
- Registrar visitas con `ref=card` con una analítica ligera y sin cookies (Vercel Analytics o Plausible), solo si el cliente lo aprueba.

## Video y medios
- Carpeta: `public/media/`.
- Solo `hero.mp4` (H.264, 4:3), sin audio. Objetivo: ≤ 3 MB en móvil. Sin webm (pesaba más que el mp4).
- `poster.jpg` = **primer frame del video** (solo se ve mientras carga) y `hero-last.jpg` = último frame.
- Vehículo: `public/media/vehicle-front.webp` + `.jpg`. Fotos de terceros solo CC0, dominio público o CC BY (nunca BY-SA/NC/ND, concesionarios, Ford ni bancos de pago) y siempre con crédito en `src/data/credits.json`.
- El clip es un arco de cámara de frente a perfil (camioneta quieta, con lluvia) que termina sobre negro puro: el hero usa fondo `#000`. **No usar `loop`**: se vería el salto. Reproducir una vez y dejar el último frame. Con `prefers-reduced-motion` o modo ahorro de datos (`navigator.connection.saveData`) no cargar el video: mostrar `hero-last.jpg` con título y CTA visibles.
- Título y CTA aparecen en `ended`, a los 4.5 s, si `play()` falla o si hay error (lo que ocurra primero). Sin JS, todo visible.
- Etiqueta: `<video muted playsinline poster="/media/poster.jpg">`; la fuente `mp4` y el autoplay los agrega JS solo si procede.
- Un solo video en toda la página. El resto, animaciones ligeras con CSS/GSAP.

## Rendimiento y calidad
- Diseñar primero para móvil (probar en 390 px) y luego escritorio (1440 px).
- Presupuesto: sin contar el video, la carga inicial debe ser ≤ 1.5 MB. Imágenes en WebP/AVIF con `loading="lazy"`.
- Respetar `prefers-reduced-motion`. Contraste AA, foco visible, botones táctiles ≥ 44 px, `alt` en imágenes.

## Seguridad
- Claves en variables de entorno, nunca en el repo: `RESEND_API_KEY`, `RESERVATION_TO_EMAIL`, `RESERVATION_FROM_EMAIL`, `PAY_VENMO_URL`, `PAY_CASHAPP_URL`, `PAY_ZELLE`.
- `.env` en `.gitignore`. Crear `.env.example` sin valores reales.
- No registrar en logs los datos personales de los clientes.

## Forma de trabajo
- Una sección por vuelta: implementar, levantar en local, revisar en móvil y escritorio, ajustar y recién ahí hacer commit.
- Commits pequeños y con mensaje claro. Nunca subir secretos.
- Antes de agregar una dependencia o un servicio de pago, preguntar.
- Si algo del brief es ambiguo o está marcado como pendiente, dejar un `TODO(cliente)` visible en el código en vez de inventar el dato.

## Implementación (decisiones tomadas)
- Datos editables: `src/config.js` (contacto; los pagos van en variables de entorno, ver `.env.example`), `src/data/services.json`, `src/data/service-area.json`, `src/data/amenities.json`. El HTML recibe estos datos en el build (plugin en `vite.config.js`, marcadores `@@clave@@` y comentarios `<!-- x:list -->`), así la página es legible sin JS; el JS solo traduce.
- Formulario: validación compartida en `src/lib/validate.js` (cliente, servidor y simulación). Lógica de servidor en `src/lib/reservation.js`; función Vercel en `api/reserve.js` (Resend por REST con `fetch`, honeypot `company`, límite de 5 envíos / 10 min por IP en memoria, 503 si faltan variables). Correo fijo en inglés con idioma, origen (`ref`: card / direct) y hora de America/Chicago.
- Cliente (`src/form.js`): el enlace de WhatsApp se arma antes de esperar al servidor; tras el envío se muestra "Continue on WhatsApp" (enlace normal, sin `window.open`). Si el correo falla, mismo botón + aviso. Sin JS, el servidor redirige a `#reserve-sent` / `#reserve-error`.
- `npm run dev` incluye una SIMULACIÓN de `/api/reserve` que valida y responde `{ ok, simulated }` sin enviar correos. Para probar el envío real: `vercel dev` con `.env`.
- `ref` de la URL (`/r` → `/?ref=card`) se guarda en sessionStorage (try/catch) y viaja en el correo.
- Builds: raíz (Vercel) y `GH_PAGES=1` (GitHub Pages, base `/ar-airport-rides/`). En Pages no hay `/api`: el formulario cae al estado de error con el botón de WhatsApp.
- Mensajes de texto (SMS): `smsNumber` en `src/config.js`; enlaces con `src/lib/sms.js` (iOS/iPadOS `sms:<n>&body=`, Android `sms:<n>?body=`, otros `sms:<n>`). En táctil "Text us" es la acción principal (dorado sólido) y WhatsApp la secundaria (contorno); en escritorio el botón de mensaje muestra el teléfono como `tel:` y WhatsApp sigue como principal. Barra móvil con ambos botones; se oculta mientras se ven los botones del hero, el cierre de #why o el formulario.
- Calidad: `npm test` (node:test), `npm run check:i18n`, `npm run check:contrast`.
- Se quitó el grano de película (aclaraba el negro puro del video).

## Pendientes (fuera del código)
- Confirmar con el cliente: ciudades finales, servicios reales, amenidades del vehículo, número de WhatsApp y si mantiene larga distancia.
- Fotos reales de la camioneta del cliente (las imágenes actuales del proyecto parecen de catálogo y son solo de referencia). Reemplazarlas antes de publicar.
- Archivo del logo AR en SVG.
- Dominio propio y correo con dominio (`reservas@...`).
- El video se generó con el plan gratuito de Higgsfield, que no incluye uso comercial. Regenerarlo o descargarlo con un plan que lo permita antes de publicar.
- Tarjeta física: QR en blanco o crema sobre fondo oscuro (el dorado escanea mal), mínimo 2 cm, margen libre y prueba de escaneo antes de imprimir.

- Cabeceras de seguridad y CSP en ercel.json. Los 2 scripts en línea de index.html están permitidos por hash: si se editan, corre 
pm run build; npm run check:csp -- --print y actualiza script-src (
pm run check:csp avisa si no coinciden).

## Flujo de respuesta al pasajero (correo del chofer → /api/confirm)
- El correo de reserva al chofer trae: botón dorado **Confirmar** (tarifa → vista previa → envío), botón **Rechazar y pedir reagendar** (vista previa → envío) y **Abrir ruta en Maps**. Sin QR: el chofer no paga.
- `/api/confirm?t=<token>` (token cifrado, 24 h, sin base de datos) muestra el formulario con las dos opciones; `&a=decline` abre directo la vista previa del rechazo. Nada se envía hasta pulsar el botón final; el pasajero recibe el correo con copia (BCC) al chofer y Reply-To al chofer.
- Correo de confirmación (es/en): sello, boleto con fecha y ruta, botones de mapa (Google Maps), tarifa y QR de Venmo/Cash App (+ Zelle). Correo de rechazo: nota cortés con botón a `SITE_URL` para reservar otra fecha.
- Mapa dentro del correo: opcional con `GOOGLE_MAPS_API_KEY` (Static Maps, clave restringida). Sin clave solo hay botones. CSP permite `img-src https://maps.googleapis.com`.
- Variables nuevas: `CONFIRM_SECRET`, `CONFIRM_SECRET_PREVIOUS` (opcional, rotación), `SITE_URL` (opcional), `GOOGLE_MAPS_API_KEY` (opcional).

### Seguridad del enlace de confirmar (`src/lib/token.js`, `src/lib/confirm.js`, `api/confirm.js`)
- Token v1: `0x01 | iv | tag | AES-256-GCM`, clave = HKDF-SHA256(`CONFIRM_SECRET`, info `ar-confirm-v1`). Solo se acepta base64url canónico. Los tokens del formato anterior (sin versión) se abren, pero solo 24 h desde que se emitieron.
- `CONFIRM_SECRET` debe tener **≥ 32 caracteres**. Si falta o es más corta: los enlaces se desactivan (la reserva al chofer se sigue enviando, sin botón de confirmar), `/api/confirm` responde 503 y el log avisa una vez por instancia. Nunca romper `/api/reserve` por la clave.
- Rotación: poner la clave vieja en `CONFIRM_SECRET_PREVIOUS` (solo abre, nunca cifra), la nueva en `CONFIRM_SECRET`, desplegar y borrar la anterior pasadas 24 h. Usar claves distintas en Production y Preview.
- Un correo por enlace (mejor esfuerzo, sin base de datos): cada envío al pasajero lleva `Idempotency-Key: ar-confirm/<sha256 de los bytes del token>` (igual para confirmar y rechazar). Resend la recuerda 24 h = vigencia del enlace: el reenvío idéntico no sale dos veces y uno distinto (otra tarifa, rechazar tras confirmar) da 409 → página "Already sent". Si se sube `TOKEN_TTL_MS` por encima de 24 h, entre las 24 h y el vencimiento se podría volver a enviar.
- Límite honesto: depende de que Resend respete la clave; no hay registro propio de "usado". Garantía fuerte = estado propio (p. ej. Vercel KV/Upstash: `SET used:<id> NX EX 86400` antes de enviar). **Nueva dependencia: consultar antes.**
- Todas las respuestas de `/api/confirm`: `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (+ `<meta name="referrer">`), `X-Robots-Tag: noindex`, `nosniff`, COOP/CORP `same-origin`; 405 con `Allow: GET, POST`. Los POST deben venir del mismo sitio (`Sec-Fetch-Site: same-origin`; con no-referrer el navegador manda `Origin: null`, por eso Origin solo se compara si trae valor). El GET nunca envía nada. El token sigue viajando en la URL (logs de Vercel, historial): por eso va cifrado y vence en 24 h; desactivar el click tracking de Resend.
## Direcciones del formulario: sugerencias y mapa con pines
- `src/places.js` + `src/lib/geo.js` + `src/styles/places.css`. En recogida y destino: sugerencias al escribir (Photon/OpenStreetMap, sesgadas a Austin, combobox accesible) y botón "Elegir en el mapa" con pin A (recogida) y B (destino): se toca el mapa o se arrastra el pin y la dirección se escribe sola (geocodificación inversa).
- Leaflet se carga solo al abrir el mapa (chunk aparte); mosaicos de tile.openstreetmap.org (oscurecidos con CSS). CSP: `connect-src https://photon.komoot.io` e `img-src https://tile.openstreetmap.org`.
- Photon y el mosaico público de OSM son de uso razonable: si el tráfico crece, cambiar el proveedor en `src/lib/geo.js` (Geoapify, MapTiler, Google Places…). Sin JS el formulario sigue siendo de texto.
- Aviso bajo los botones del mapa (`#maps-notice`) con enlace a `privacy/#location`.

## Páginas legales (auditoría SEC-04)
- `privacy/index.html` y `terms/index.html` (entradas multi-página en `vite.config.js` → `/privacy/` y `/terms/`; sin reglas en `vercel.json`). Cada página trae el texto en/es (`<article data-legal-lang>`); `src/legal.js` muestra el del idioma activo y traduce `#ancla` ↔ `#es-ancla`. Estilos: `src/styles/legal-page.css` (páginas) y `src/styles/legal.css` (avisos del formulario y enlaces del footer). Sin scripts en línea: la CSP no cambia.
- **TODO(legal): los textos de privacidad, términos, SMS y avisos son BORRADORES sin revisión de un abogado; no se marcan como borrador en pantalla. Ver los comentarios `TODO(legal)` / `TODO(cliente)` en esas páginas antes de publicar.**
- Si se agregan cookies, analítica o SMS automáticos, actualizar `privacy/index.html` (secciones Cookies y Text messages).
