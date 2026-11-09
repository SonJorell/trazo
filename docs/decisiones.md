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
