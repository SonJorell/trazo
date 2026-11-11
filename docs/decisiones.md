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
