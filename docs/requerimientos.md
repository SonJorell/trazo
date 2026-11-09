# Trazo — Levantamiento de requerimientos

## 1. Contexto

Se analizó Excalidraw (`D:\CLAUDE\excalidraw`, ~700 archivos TypeScript, monorepo React + Vite).
Su colaboración en vivo depende de dos servicios externos: un servidor de salas Socket.IO
(`VITE_APP_WS_SERVER_URL`) y Firebase (Google) para persistir escenas e imágenes. Además, las
funciones de compartir enlaces, librerías e IA apuntan a servidores de excalidraw.com.

**Trazo** es una pizarra colaborativa escrita desde cero, gratuita y autocontenida: un único
proceso Node.js que corre en el PC del usuario y sirve la pizarra a cualquier dispositivo de la
misma red (celular, tablet, otro PC) sin cuentas ni servicios de terceros.

## 2. Audiencia objetivo

- **Usuario final**: el dueño del PC, que dibuja desde varios dispositivos, y las personas a las que
  invita a una sala. No técnico: debe bastar con abrir un enlace o escanear un QR.
- **Desarrollador**: quien mantenga el proyecto. Necesita un código modular, probado y documentado.

## 3. Requerimientos funcionales

| ID | Requerimiento |
|----|---------------|
| RF-01 | Crear una sala con un código corto y, opcionalmente, un PIN numérico. |
| RF-02 | Unirse a una sala con su código o enlace; pedir el PIN si la sala lo tiene. |
| RF-03 | Herramientas: lápiz a mano alzada, rectángulo, elipse, línea, flecha, texto, borrador. |
| RF-04 | Herramienta de selección: seleccionar (clic o recuadro), mover, redimensionar rectángulos/elipses, eliminar. |
| RF-05 | Color de trazo, color de relleno y grosor configurables. |
| RF-06 | Desplazar (mano / espacio / dos dedos) y hacer zoom (rueda / pellizco). |
| RF-07 | Deshacer y rehacer las acciones propias. |
| RF-08 | Sincronización en tiempo real: los trazos de otros aparecen mientras se dibujan. |
| RF-09 | Presencia: lista de participantes y cursores remotos con nombre y color. |
| RF-10 | Compartir: mostrar el enlace de la sala por la red local y un código QR para el celular. |
| RF-11 | Persistencia: la pizarra se conserva al cerrar el navegador o reiniciar el servidor. |
| RF-12 | Exportar la pizarra como imagen PNG. |
| RF-13 | Limpiar la pizarra (acción deshacible). |
| RF-14 | *(v1.1)* Capa transparente siempre encima de todas las ventanas para dibujar sobre la pantalla del PC. |
| RF-15 | *(v1.1)* Alternar entre «dibujar» y «usar el PC» (clics a través de la capa) con un atajo global. |
| RF-16 | *(v1.1)* Transmitir la pantalla del PC a la sala para verla de fondo en otros dispositivos. |
| RF-17 | *(v1.1)* Las marcas hechas desde otro dispositivo aparecen sobre la pantalla del PC en la misma posición. |

## 4. Reglas de negocio

- RN-01: El código de sala tiene 6 caracteres de un alfabeto sin ambigüedades (sin `0/O/1/l/i`).
- RN-02: Si una sala tiene PIN, nadie puede leer ni modificar su contenido sin el PIN correcto.
- RN-03: El PIN se guarda solo como hash `scrypt` con sal; nunca en texto plano.
- RN-04: Ante ediciones concurrentes de un mismo elemento gana la versión más alta
  (*last-writer-wins* por elemento); a igual versión, desempata un `nonce` aleatorio.
- RN-05: Borrar es un borrado lógico (`isDeleted`) para que deshacer y la sincronización funcionen.
- RN-06: Deshacer solo revierte acciones del propio usuario.

## 5. Requerimientos no funcionales y limitantes técnicos

- RNF-01: Sin dependencias de servicios externos ni cuentas. Funciona sin internet.
- RNF-02: Navegadores modernos de escritorio y móviles (Chrome, Edge, Safari iOS, Firefox).
- RNF-03: Interfaz usable con dedo en pantallas desde 360 px de ancho.
- RNF-04: Latencia percibida < 100 ms en red local.
- RNF-05: Dependencias mínimas en el servidor (`ws`, `qrcode`) y ninguna en el cliente (sin paso de compilación).
- RNF-06: Límites defensivos: 512 KB por mensaje, 20 000 elementos por sala, 5 000 puntos por trazo,
  2 000 caracteres por texto, control de ráfagas de mensajes por cliente.
- **Limitante**: el acceso es por red local. Desde internet se requiere un túnel (ver Trabajo futuro).
- **Limitante**: Windows pedirá permitir Node.js en el firewall la primera vez (redes privadas).

## 6. Criterios de éxito

1. Desde el celular, conectado a la misma Wi-Fi, se abre la sala escaneando el QR y se dibuja.
2. Un trazo hecho en un dispositivo aparece en el otro mientras se dibuja.
3. Una sala con PIN rechaza la conexión sin PIN o con PIN incorrecto.
4. Tras reiniciar el servidor, la pizarra conserva su contenido.
5. Todas las pruebas automáticas pasan y el linter no reporta errores.

## 7. MVP (núcleo a entregar primero)

RF-01 a RF-13 tal como se describen arriba. Todo lo demás va al backlog.

## 8. Tablero Kanban (tickets del MVP)

Cada ticket se considera **Terminado** cuando el código está en `develop`, tiene pruebas (si aplica)
y el linter pasa.

| Ticket | Descripción | Definición de terminado | Estado |
|--------|-------------|-------------------------|--------|
| T-01 | Modelo de elementos y reglas LWW compartidas | `shared/elements.js` con pruebas de saneo y fusión | Terminado |
| T-02 | Geometría (límites, impacto) | `shared/geometry.js` con pruebas | Terminado |
| T-03 | Salas, PIN y persistencia | `server/rooms` + `server/storage` con pruebas | Terminado |
| T-04 | Servidor HTTP estático + API + QR | `server/http` sirve cliente y API | Terminado |
| T-05 | Tiempo real (WebSocket) | `server/realtime` con prueba de integración | Terminado |
| T-06 | Lienzo, vista, zoom y paneo | `public/js/core`, `render`, `input` | Terminado |
| T-07 | Herramientas de dibujo y selección | `public/js/tools` | Terminado |
| T-08 | Sincronización cliente y reconexión | `public/js/net` | Terminado |
| T-09 | UI: barra, panel de estilo, presencia, compartir | `public/js/ui` | Terminado |
| T-10 | Documentación y empaquetado | README, docs, script `.bat` | Terminado |
| T-11 | Retransmisión de pantalla en el servidor | Mensajes `screen`/`screen-stop` con prueba de integración | Terminado |
| T-12 | Modo overlay en el cliente | `?overlay=1`: transparente, vista 1:1, modos dibujar/usar PC | Terminado |
| T-13 | Visor de pantalla en vivo | Fondo con la pantalla compartida y aviso «Pantalla en vivo» | Terminado |
| T-14 | App de escritorio Electron | Ventana transparente, atajos globales, bandeja, servidor embebido | Terminado |

## 9. Backlog — Trabajo futuro

- Overlay en varios monitores (hoy cubre el monitor principal).
- Marcas que se desvanecen solas (modo puntero láser).
- Transmisión por WebRTC para más fluidez (hoy JPEG por WebSocket, ~6 cuadros/s).
- Instalador de la app de overlay (.exe) con inicio automático.

- Acceso desde internet mediante túnel gratuito (Cloudflare Tunnel o Tailscale).
- Estilo "a mano" tipo boceto (trazos irregulares).
- Redimensionar y rotar todos los tipos de elemento.
- Imágenes pegadas o subidas.
- Copiar, pegar y duplicar elementos.
- Varias páginas por sala y plantillas.
- Compactación de elementos borrados (lápidas) antiguos.
- Exportar a SVG y a JSON; importar JSON.
- Permisos por participante (solo lectura).
- Aplicación instalable (PWA) y modo sin conexión.
