# Bitácora de decisiones técnicas (ADR)

Cada entrada registra el contexto, la decisión y sus consecuencias.

## ADR-001 — Construir desde cero en lugar de reutilizar Excalidraw

- **Contexto**: Excalidraw es MIT y gratuito, pero su colaboración depende de Firebase y de un
  servidor de salas aparte, y el proyecto pesa ~700 archivos TypeScript con paso de compilación.
- **Decisión**: escribir una pizarra propia, pequeña y sin servicios externos.
- **Consecuencias**: control total del código y despliegue trivial; menos funciones que Excalidraw
  al inicio (sin estilo a mano, sin imágenes). Las faltantes quedan en el backlog.

## ADR-002 — Node.js con un solo proceso para HTTP y WebSocket

- **Contexto**: el usuario ya tiene Node.js instalado (lo usa Excalidraw) y trabaja en Windows.
- **Decisión**: un único servidor Node (`http` nativo + librería `ws`) sirve el cliente, la API y el
  canal en tiempo real en el mismo puerto (3080 por defecto).
- **Consecuencias**: un solo comando para arrancar y un solo puerto que abrir en el firewall.

## ADR-003 — Cliente en JavaScript nativo (módulos ES) sin compilación

- **Contexto**: se busca un proyecto autosuficiente que cualquiera pueda clonar y ejecutar.
- **Decisión**: HTML + CSS + módulos ES servidos tal cual; sin frameworks ni empaquetador.
- **Consecuencias**: cero pasos de compilación y arranque instantáneo. A cambio, no hay tipado
  estático; se compensa con pruebas y ESLint.

## ADR-004 — Código compartido entre servidor y cliente (`shared/`)

- **Decisión**: las reglas del modelo (saneo, fusión LWW) y la geometría viven en `shared/` y las
  importan tanto Node como el navegador (el servidor expone la carpeta en `/shared/`).
- **Consecuencias**: una sola fuente de verdad para validar y fusionar; las pruebas cubren ambos lados.

## ADR-005 — Sincronización last-writer-wins por elemento

- **Contexto**: se necesita colaboración en tiempo real sin la complejidad de CRDTs completos.
- **Decisión**: cada elemento lleva `version` y `nonce`. Gana la versión mayor; a igualdad, el
  `nonce` mayor. El servidor es la referencia y reenvía solo cambios aceptados.
- **Consecuencias**: convergencia garantizada y simple. Dos personas editando *el mismo* elemento a
  la vez: prevalece la última edición (aceptable para una pizarra).

## ADR-006 — Borrado lógico y deshacer basado en operaciones

- **Decisión**: borrar marca `isDeleted: true` y sube la versión. Deshacer/rehacer reaplica el
  estado anterior/posterior como una edición nueva (versión mayor), así se propaga a todos.
- **Consecuencias**: el historial funciona en colaboración; quedan "lápidas" en la sala (backlog:
  compactación).

## ADR-007 — Persistencia en archivos JSON detrás de una interfaz

- **Decisión**: `FileStore` guarda cada sala en `data/rooms/<código>.json` con escritura atómica
  (archivo temporal + renombrar) y guardado diferido de 1 s. `RoomManager` solo conoce la interfaz
  `load/save/exists`.
- **Consecuencias**: cero instalación de bases de datos. Cambiar a SQLite o Redis implica escribir
  otra clase con la misma interfaz, sin tocar el resto.

## ADR-008 — PIN con scrypt y comparación en tiempo constante

- **Decisión**: el PIN se guarda como `scrypt(pin, sal)`; se verifica con `timingSafeEqual`.
- **Consecuencias**: el archivo de la sala no revela el PIN. Un PIN de 4–8 dígitos es protección
  básica para una red local, no para internet (por eso el acceso remoto está en el backlog).

## ADR-009 — Puerto 3080

- **Contexto**: Excalidraw ya usa 3001 y su MCP 3000 en este equipo.
- **Decisión**: puerto 3080 por defecto, configurable con la variable `PORT`.

## ADR-010 — Electron para dibujar sobre la pantalla

- **Contexto**: se pidió marcar encima de cualquier programa. Un navegador no puede crear ventanas
  transparentes, siempre encima y que dejen pasar los clics.
- **Decisión**: una app Electron mínima (`overlay/`) que abre la página de Trazo con
  `?overlay=1` en una ventana transparente, sin marco y siempre encima. Alterna con
  `setIgnoreMouseEvents` entre «dibujar» y «usar el PC», y reenvía el movimiento del ratón para que
  la píldora de control siga siendo clicable.
- **Consecuencias**: reutiliza el 100 % del cliente y del protocolo. Electron se instala aparte
  (~100 MB) para que el servidor siga siendo liviano. Si el servidor no corre, la app lo inicia
  dentro de su propio proceso.

## ADR-011 — Pantalla compartida como JPEG por WebSocket (no WebRTC)

- **Contexto**: el celular debe ver la pantalla del PC para saber dónde marca.
- **Decisión**: el overlay captura la pantalla (`getDisplayMedia` sin diálogo vía
  `setDisplayMediaRequestHandler`), la reduce a ≤1600 px y envía JPEG a ~6 cuadros/s por el mismo
  WebSocket. La calidad se adapta para quedar bajo ~300 KB por cuadro. Se salta cuadros si nadie
  mira o si la red va atrasada, y el servidor descarta cuadros para clientes lentos (`volatile`).
- **Alternativa descartada**: WebRTC da más fluidez, pero requiere señalización, ICE y tiene
  particularidades en Safari sobre HTTP. Queda en el backlog.
- **Consecuencias**: implementación simple y robusta en la red local; ~6 fps es suficiente para
  señalar y explicar.

## ADR-012 — Coordenadas 1:1 y exclusión de la captura

- **Decisión**: en modo overlay la vista se fija en zoom 1 y origen (0,0), así las coordenadas del
  mundo son píxeles lógicos de la pantalla. Los visores dibujan la pantalla recibida en
  `(0,0,ancho,alto)` del mundo, por lo que una marca hecha en el celular cae en el mismo punto de la
  pantalla del PC. La ventana usa `setContentProtection(true)` para no salir en su propia captura
  y no duplicar las marcas.

## ADR-013 — Cierre de salas vacías por barrido periódico

- **Contexto**: las salas no debían quedar abiertas para siempre.
- **Decisión**: cada sala guarda `lastActiveAt` (última entrada o salida). Un barrido cada 30 s
  cierra las que llevan vacías más de `EMPTY_ROOM_TTL_MIN` (2 min): las quita de memoria y borra
  su archivo. El barrido también revisa el disco, para limpiar salas viejas tras un reinicio, y da
  un plazo de gracia desde el arranque para que nadie pierda su sala al reiniciar el servidor.
- **Alternativa descartada**: un temporizador por sala no sobrevive a reinicios y complica las
  carreras entre cargar y cerrar.
- **Consecuencias**: el comportamiento es simple de probar (`sweep(now)`) y robusto. El plazo
  absorbe recargas de página y cortes breves de Wi-Fi.

## ADR-014 — Transmitir desde el navegador del anfitrión

- **Decisión**: además del overlay, el anfitrión puede transmitir desde Chrome o Edge con
  `getDisplayMedia` (pide qué pantalla o ventana compartir y excluye la propia pestaña). Ve su
  propia transmisión de fondo como vista previa local, sin pasar por la red.
- **Consecuencias**: «En directo» funciona sin instalar nada. El overlay sigue siendo la opción
  para dibujar directamente encima de la pantalla del PC.

## ADR-015 — Cola de escritura por sala en FileStore

- **Contexto**: en uso real apareció `ENOENT` al renombrar archivos temporales: un guardado
  diferido y un `flush` escribían el mismo `.tmp` a la vez.
- **Decisión**: las operaciones de cada sala se encolan, y cada escritura usa un archivo temporal
  único.
- **Consecuencias**: no hay más choques. Una prueba lanza 20 guardados simultáneos y verifica el
  resultado.

## ADR-016 — Control remoto: clave por sala y lista blanca de órdenes

- **Contexto**: el celular debe poder pasar diapositivas en el PC, pero nadie más de la sala debe
  poder manejarlo.
- **Decisión**: el overlay genera una clave aleatoria de 24 caracteres por sala y la registra en el
  servidor (`control-register`), que la guarda solo en memoria. El QR de control lleva la clave en
  el fragmento (`#k=`), que el navegador no envía en las peticiones. Cada orden `control` se
  compara con `timingSafeEqual` y se valida con `validateControl` (lista blanca y rangos). El
  servidor la reenvía solo al PC registrado y sin la clave.
- **Consecuencias**: un participante normal no puede mover diapositivas ni ver la clave. Si la
  clave se filtra, basta con «Nueva sala».

## ADR-017 — Teclas con un proceso PowerShell persistente

- **Contexto**: Electron no puede simular teclas en otros programas, y los módulos nativos
  (robotjs, nut.js) requieren compilación.
- **Decisión**: al arrancar, el overlay lanza `powershell -File keys.ps1`, que compila un
  envoltorio mínimo de `keybd_event` y lee de su entrada estándar líneas `«código» «extendida»`.
  `main.js` traduce cada acción con un mapa fijo (`KEYMAP`), así que nunca se envía texto
  arbitrario.
- **Consecuencias**: no hay dependencias nativas y la latencia es baja, porque el proceso queda
  abierto. Solo funciona en Windows, que es la plataforma objetivo.

## ADR-018 — Lupa propia en lugar de la Lupa de Windows

- **Decisión**: la lupa captura la pantalla en vivo y la dibuja como fondo de la capa (que está
  excluida de la captura). Luego acerca la vista con una animación suave. Las marcas comparten
  coordenadas con la pantalla, así que se amplían alineadas.
- **Alternativa descartada**: la Lupa de Windows sigue al puntero y obligaría a mover el ratón
  del usuario.
- **Consecuencias**: el zoom funciona sobre cualquier programa sin tocar el ratón ni la
  configuración del sistema. La captura se libera 15 s después de quitar la lupa.

## ADR-019 — HTTPS local con certificado autogenerado

- **Contexto**: los navegadores móviles solo permiten `getUserMedia` (cámara) en contextos
  seguros, y `http://192.168.x.x` no lo es.
- **Decisión**: al arrancar, el servidor genera (o reutiliza) un certificado autofirmado EC P-256
  válido por 2 años, con SAN para `localhost`, `127.0.0.1` y las IP de la red. Sirve la misma app y
  el mismo WebSocket también en `https://…:3443`. Se regenera si cambian las IP. El QR de
  «Compartir» apunta a HTTPS.
- **Alternativas descartadas**: mkcert (sin advertencias, pero hay que instalar una CA en cada
  celular) y un túnel público (necesita internet y saca el tráfico de la red local).
- **Consecuencias**: cada celular acepta una advertencia la primera vez. HTTP sigue disponible
  para quien no necesita cámara.

## ADR-020 — Cámaras por WebRTC, solo hacia quien proyecta

- **Decisión**: cada participante con cámara abre una `RTCPeerConnection` por cada participante
  `display` (overlay o anfitrión). La señalización viaja por el WebSocket con mensajes `rtc`
  dirigidos (máx. 64 KB), procesados en orden. No se usa STUN/TURN; el overlay desactiva la
  ocultación de IP por mDNS para que las candidatas locales funcionen. Solo video, 640×480.
- **Alternativa descartada**: JPEG por WebSocket, como la pantalla compartida. Para caras en
  movimiento la fluidez y el ancho de banda de WebRTC son muy superiores.
- **Consecuencias**: video fluido con poca carga para el servidor, que solo reenvía señales.
  Depende de que la red local permita tráfico entre equipos (firewall en redes privadas).

## ADR-021 — Permiso de diapositivas concedido por el anfitrión

- **Decisión**: el servidor guarda en memoria qué participantes tienen permiso (`room.grants`).
  Solo el PC registrado como controlador puede dar o quitar permisos. Un participante con permiso
  puede enviar `control` sin clave, pero solo para acciones de `GRANTED_ACTIONS`. Los permisos se
  borran si el participante o el controlador se desconectan.
- **Consecuencias**: control compartido sin repartir la clave del QR de control. La lupa y la
  transmisión quedan reservadas a quien tiene la clave.

## ADR-022 — Clave de anfitrión: una sola presentación principal

- **Contexto**: en las pruebas reales otro participante abrió la sala en modo proyector y empezó a
  recibir las solicitudes de control. No quedaba claro cuál era la ventana «principal».
- **Decisión**: `POST /api/rooms` entrega una `hostKey` aleatoria una sola vez; la sala guarda
  solo su SHA-256. En `join`, quien presenta la clave queda como `host`. Solo el anfitrión puede
  marcarse `display` (recibir cámaras), registrar el control remoto y transmitir su pantalla. Las
  demás peticiones devuelven `not_host`. La app de overlay guarda la clave junto con la sala y se
  la pasa a su página por el fragmento `#host=` (no viaja en peticiones HTTP). El navegador que
  creó la sala desde el inicio la guarda en `localStorage`.
- **Consecuencias**: un enlace o un QR filtrado no permite tomar el control de la presentación.
  La interfaz marca la ventana principal con ★. Las salas creadas antes de este cambio no tienen
  anfitrión: hay que crear una nueva.

## ADR-023 — Pinceles como estilo del elemento

- **Decisión**: el pincel (`brush`), el tipo de línea (`dash`) y la opacidad son propiedades de
  cualquier elemento con trazo, no tipos nuevos. El renderizado aplica el pincel (grosor efectivo,
  transparencia, *multiply* para el resaltador, halo y núcleo para el neón), y la geometría usa el
  mismo grosor efectivo para detectar clics.
- **Consecuencias**: todas las formas (líneas, flechas, rectángulos, elipses, trazos libres)
  admiten los cuatro pinceles sin duplicar herramientas. Los elementos antiguos quedan como `pen`
  continuo y opaco.

## ADR-024 — Láser y reacciones efímeros

- **Decisión**: el puntero láser y las reacciones viajan como mensajes que el servidor valida y
  reenvía, pero no guarda en la sala. El láser se envía por trozos cada 40 ms y se descarta si la
  red va atrasada. Las reacciones vienen de una lista cerrada, con un límite de frecuencia.
- **Consecuencias**: señalar y reaccionar no ensucian la pizarra ni el historial, y no ocupan
  disco.

## ADR-025 — Páginas como campo del elemento y página activa compartida

- **Decisión**: cada elemento lleva `page` (0–999) y la sala guarda la página activa (`room.page`,
  persistida). Solo el anfitrión o quien tenga permiso la cambia (`page`), y todos la siguen. La
  escena filtra por la página activa, así que dibujar, seleccionar, borrar y exportar PNG trabajan
  sobre la página visible. El PDF recorre todas.
- **Consecuencias**: «marcas por diapositiva» es solo cambiar de página al pasar diapositiva. Al
  volver, las marcas siguen ahí. No hace falta conocer el programa de presentación.

## ADR-026 — Seguir al presentador con la zona visible

- **Decisión**: el anfitrión publica cada 300 ms (solo si cambió) el rectángulo del mundo que está
  viendo (`view`). Los demás lo encajan en su pantalla mientras no muevan la vista a mano; si lo
  hacen, aparece el botón **Seguir**.
- **Consecuencias**: funciona igual en pizarra en blanco, en directo y con la lupa del overlay, y
  en pantallas de cualquier tamaño.

## ADR-027 — Temporizador y votación en el servidor

- **Decisión**: el servidor guarda el temporizador (`endsAt`) y la votación (opciones y un voto
  por participante, que se puede cambiar). Difunde solo los recuentos, nunca quién votó qué. Solo
  el anfitrión los abre y cierra.
- **Consecuencias**: quien entra tarde ve el estado actual. El anonimato del voto queda
  garantizado por diseño.

## ADR-028 — PDF sin dependencias

- **Decisión**: cada página se dibuja en un lienzo, se comprime a JPEG y se inserta en un PDF 1.4
  escrito a mano (`pdfWriter.js`, con tabla xref verificada por una prueba).
- **Consecuencias**: no se agregan librerías al cliente. El PDF es de imágenes (no se puede
  seleccionar texto), suficiente para compartir el resultado de una sesión.

## ADR-029 — Fondo de hoja como estado de la sala, dibujado en el mundo

- **Decisión**: `room.background = { pattern, color }` se guarda con la sala y viaja en `welcome`
  y en el mensaje `background` (solo anfitrión o con permiso). El diseño se dibuja en
  coordenadas del mundo, así acompaña al zoom y al desplazamiento, y se omiten las líneas cuando
  quedarían a menos de ~5 px.
- **Consecuencias**: todos ven la misma hoja y las exportaciones la incluyen. En papel oscuro la
  tinta negra por defecto se dibuja clara y el resaltador usa mezcla «pantalla» en vez de
  «multiplicar», sin modificar los elementos guardados.

## ADR-030 — Adjuntos por HTTP, elementos con URL de la sala

- **Decisión**: los archivos se suben por `POST /api/rooms/:id/assets` (cuerpo binario, no por el
  WebSocket) a `data/assets/<sala>/<aleatorio>.<ext>`. El permiso es un HMAC de la sala con un
  secreto del proceso, que solo reciben quienes entran a la sala (en `welcome`). Los elementos
  `image`/`doc`/`file` solo aceptan URLs `/assets/…` (validadas con expresión regular).
- **Consecuencias**: el WebSocket no se bloquea con archivos grandes; nadie puede insertar URLs
  externas. Solo PNG/JPG/GIF/WebP/PDF se sirven en línea; el resto se descarga
  (`Content-Disposition: attachment`, `nosniff`, CSP `sandbox`). Los archivos se borran al cerrar
  la sala (y los huérfanos en la limpieza periódica).

## ADR-031 — PDF a imágenes en el navegador; Office a PDF en el anfitrión

- **Decisión**: pdf.js (servido desde `node_modules/pdfjs-dist`, carga diferida) renderiza cada
  página a JPEG en el navegador de quien adjunta; las páginas se suben como imágenes. Los
  archivos de Office se convierten primero a PDF en el servidor: con Microsoft Office por COM
  (PowerShell, rutas por variables de entorno, sin cerrar presentaciones abiertas) o con
  LibreOffice sin interfaz. Las conversiones van en cola, de una en una, con 120 s de límite.
- **Consecuencias**: todos los dispositivos (incluidos celulares lentos) solo descargan imágenes;
  no hay que instalar nada nuevo en Windows con Office. Sin Office ni LibreOffice el archivo queda
  como tarjeta descargable. El texto de los documentos no es seleccionable (son imágenes).

## ADR-032 — Anotaciones ancladas a la página de un documento

- **Decisión**: lo que se crea sobre un documento guarda `anchor` (id del documento) y
  `anchorPage`. La escena oculta las anotaciones cuya página no es la visible del documento;
  seleccionar y mover/redimensionar un documento arrastra también sus anotaciones (escaladas
  respecto de su esquina).
- **Consecuencias**: se puede explicar un PDF página por página sin borrar nada. Si el documento
  se elimina, sus anotaciones quedan visibles (no se pierden).

## ADR-033 — Trazos en vivo por deltas efímeros

- **Decisión**: mientras se dibuja con el lápiz, los cambios son «transitorios»: no se envía el
  elemento completo cada 40 ms sino un mensaje `stroke { id, from, pts }` con solo los puntos
  nuevos cada ~16 ms (el primero lleva el estilo). El servidor lo retransmite como volátil y no lo
  guarda. Al soltar se envía el trazo completo una vez, que reemplaza al provisional. Además: las
  operaciones se agrupan cada 20 ms, el cursor cada 33 ms y se interpola en el receptor; un
  `ping` cada 4 s mide la latencia.
- **Consecuencias**: el tráfico de un trazo pasa de crecer con el cuadrado de sus puntos a ser
  lineal, y los demás lo ven aparecer casi sin retraso. Si se pierde un trozo (o alguien entra a
  mitad), el trazo aparece completo al soltar.

## ADR-034 — Fondo por página con valor general

- **Decisión**: la sala guarda un fondo general y un mapa `pageBackgrounds` (página → fondo). El
  mensaje `background` con `page` cambia solo esa página; sin `page` cambia el general y borra
  los propios. Los títulos van en `pageTitles` con el mensaje `page-title`.
- **Consecuencias**: cada página puede tener su hoja (p. ej. pentagrama en una, cuadrícula en
  otra) y todos ven lo mismo; volver a «todas» deja la sala coherente en un paso.

## ADR-035 — Sin eco del cambio de página y página en cursores/láser

- **Decisión**: el servidor ya no devuelve el cambio de página a quien lo hizo (que ya lo
  aplicó). Cursores y láser llevan `p` (página) y no se dibujan en otra página. El cursor pasa a
  ser volátil (se descarta si el cliente va atrasado).
- **Consecuencias**: pasar varias páginas rápido no provoca saltos hacia atrás; no aparecen
  punteros «fantasma» de quien está en otra página.

## ADR-036 — Conexión: reconectar al volver y detectar sockets muertos

- **Decisión**: si un `ping` queda más de 10 s sin respuesta, el cliente cierra y reconecta; al
  volver la pestaña a primer plano (o al recuperar la red) reconecta de inmediato si estaba sin
  conexión. Se mide el ping pendiente, no el tiempo desde el último, para no reconectar pestañas
  en segundo plano que solo tienen los temporizadores ralentizados.
- **Consecuencias**: los celulares que se bloquean vuelven a sincronizarse en cuanto se
  desbloquean, en vez de esperar la espera exponencial.

## ADR-037 — Paleta única y grosor en porcentaje

- **Decisión**: una paleta de 18 colores sirve a todos los pinceles (el neón es un efecto, no un
  juego de colores). El grosor se elige de 1 a 100 % y se convierte a 1–48 px de forma lineal; la
  opacidad de 5 a 100 %. El halo del neón se acota (máx. 36 px) para que los trazos gruesos no se
  vuelvan una mancha.
- **Consecuencias**: el modelo de datos no cambia (`strokeWidth` y `opacity` siguen siendo
  números); los trazos antiguos se ven igual.

## ADR-038 — Roles por navegador aplicados en el servidor

- **Decisión**: cada participante tiene rol `visita`, `editor` o `presentador` (el anfitrión es
  `host`). El servidor rechaza o descarta los mensajes de edición de las visitas (`ops`, trazos,
  láser, cursor, cámara, avatar, pedir diapositivas). El rol se guarda en la sala por el id
  estable del navegador (`clientId`, el mismo que marca «mis trazos») para que se conserve al
  reconectar; la gente nueva recibe el rol por defecto que fija el anfitrión. «Presentador» es
  el permiso de diapositivas existente (`grants`), así que ambos caminos quedan sincronizados.
- **Consecuencias**: las salas con muchas personas (votaciones) son ordenadas y seguras ante
  clientes modificados. Limitación conocida: en la red local alguien podría imitar el `clientId`
  de otra persona; con rol por defecto «visita» eso no da más permisos que entrar de nuevo.

## ADR-039 — Avatares: física en el dueño, interpolación en los demás

- **Decisión**: el monigote lo simula su dueño (30 pasos/s: caminar hacia el puntero, gravedad,
  superficies de figuras/notas/imágenes/documentos/sillas, salto solo para subirse a algo) y
  comparte la posición ~15 veces/s con `avatar-pos` (volátil). Los demás interpolan. El suelo es
  el borde inferior de la vista del presentador, igual para todos.
- **Consecuencias**: sin servidor de física ni divergencias; el costo de red es mínimo. Las sillas
  son elementos normales de la pizarra (se mueven, borran y deshacen como cualquier figura).

## ADR-040 — Cámara dibujada en el lienzo según el modo de cada persona

- **Decisión**: la persona elige forma y modo (`avatar`). En modo fija se usa la burbuja HTML de
  siempre (con su forma); en «sigue el puntero», «anclada» y «monigote» la burbuja se oculta y el
  video se dibuja en el lienzo recortado a la forma (cabeza del monigote incluida).
- **Consecuencias**: la cámara se mueve con la pizarra y queda alineada con lo dibujado. Como las
  cámaras solo viajan a la presentación principal (WebRTC 1→anfitrión), los demás ven el
  monigote con iniciales; ver todas las cámaras en todos los equipos queda como trabajo futuro.

## ADR-041 — Íconos vectoriales en lugar de emojis

- **Decisión**: todos los símbolos de la interfaz son SVG propios (trazo de 2 px). Las reacciones
  viajan como claves (`like`, `love`, `laugh`, `wow`, `party`, `idea`, `question`, `hand`) y los
  sellos son un tipo de elemento `stamp` con un ícono vectorial que se dibuja con `Path2D`.
- **Consecuencias**: aspecto profesional y uniforme (los emojis cambian según el sistema y no
  siguen el color de la tinta); los sellos se pueden redimensionar sin perder nitidez y toman el
  color elegido. Los sellos antiguos (texto) se siguen viendo.

## ADR-042 — Monigote: física por cuadro y animación derivada del movimiento

- **Decisión**: la física del dueño corre con `requestAnimationFrame` (paso real, acotado a 50 ms)
  y comparte posición y velocidad cada 50 ms. Los demás predicen con la velocidad (máx. 120 ms) y
  suavizan con un filtro exponencial independiente de los FPS. La fase de la caminata, la amplitud,
  la inclinación y el «estar en el aire» se calculan en cada equipo a partir del movimiento que ve.
- **Consecuencias**: el monigote se ve continuo aunque los mensajes lleguen con saltos; no hace
  falta enviar la pose completa.

## ADR-043 — Reorganizar páginas en el servidor

- **Decisión**: mover, duplicar o borrar una página es un único mensaje `page-op` que el
  servidor aplica de forma atómica: re-numera los elementos (subiendo su versión, para que gane la
  regla LWW), crea las copias con ids nuevos (re-anclando las anotaciones de documentos) y mueve
  títulos, fondos y notas. Luego difunde `ops`, `page-meta` y `page`. El historial de deshacer de
  cada cliente se vacía porque sus pasos ya no corresponden a las mismas páginas.
- **Consecuencias**: no hay estados intermedios inconsistentes entre participantes; el borrado de
  una página no se puede deshacer (se pide confirmación).

## ADR-044 — Notas del presentador privadas

- **Decisión**: las notas se guardan en la sala (`notes`, por página) pero solo se envían a
  conexiones de anfitrión (en `welcome` y con el mensaje `notes`). Un participante nunca las recibe.
- **Consecuencias**: el anfitrión puede preparar la charla en su PC y verla en otra ventana suya.

## ADR-045 — Cámaras para todos con malla limitada (sin SFU)

- **Decisión**: quien quiere ver las cámaras lo anuncia (`cam-watch`); cada emisor abre una
  conexión WebRTC con la presentación (calidad completa) y con hasta 8 espectadores (300 kbps,
  resolución ÷1,5, 20 fps). Cada señal lleva `role` (`send`/`recv`) porque dos personas pueden
  enviarse cámara mutuamente. Las visitas solo pueden mandar señales de receptor.
- **Alternativas**: un SFU (p. ej. mediasoup) escala mejor pero exige compilar módulos nativos y
  más CPU en el PC anfitrión; para salas de una red local de hasta ~8 cámaras la malla basta.
- **Consecuencias**: sin servidor de video y sin instalación extra; con muchas cámaras y
  espectadores el uso de red crece (N×M), por eso el límite y la calidad reducida.

## ADR-046 — Compartir la pantalla del celular: fuera del alcance web

- **Decisión**: no se implementa. Los navegadores móviles (Chrome Android, Safari iOS) no ofrecen
  `getDisplayMedia`; la única vía sería una app nativa. Se documenta la alternativa de reflejar el
  celular en el PC y transmitir esa ventana.
