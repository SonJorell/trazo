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
