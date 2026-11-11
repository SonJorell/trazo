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
| RF-18 | *(v1.2)* Al crear la sala, el anfitrión elige «En blanco» o «En directo»; en directo se le ofrece transmitir su pantalla desde el navegador del PC y ve una vista previa. |
| RF-19 | *(v1.2)* En el celular, la transmisión ocupa toda la pantalla disponible, tiene modo pantalla completa y se reajusta al girar el teléfono. |
| RF-20 | *(v1.2)* Una sala sin participantes se cierra y se borra pasado un plazo configurable (2 min por defecto). |
| RF-21 | *(v1.3)* Control remoto desde el celular: siguiente, anterior, inicio, fin, pantalla negra o blanca, iniciar y salir en el programa de presentación del PC. |
| RF-22 | *(v1.3)* Lupa: ampliar desde el celular una zona de la pantalla del PC (tocar, pellizcar, arrastrar, quitar). |
| RF-23 | *(v1.3)* Solo quien tenga el QR de control (con clave secreta) puede controlar el PC. |
| RF-24 | *(v1.4)* Los participantes encienden su cámara (solo video) y aparece como burbuja en quien proyecta. |
| RF-25 | *(v1.4)* Las burbujas se mueven, cambian de tamaño y se quitan; el participante puede cambiar de cámara. |
| RF-26 | *(v1.4)* Un participante pide pasar diapositivas; el anfitrión aprueba, rechaza o quita el permiso. |
| RF-27 | *(v1.4)* HTTPS local con certificado autogenerado para permitir la cámara en celulares. |
| RF-28 | *(v1.4)* Una sola presentación principal por sala: la de quien la creó (clave de anfitrión). |
| RF-29 | *(v1.5)* Pinceles lápiz, marcador, resaltador y neón; colores neón; líneas discontinua/punteada; opacidad. |
| RF-30 | *(v1.5)* Puntero láser efímero compartido. |
| RF-31 | *(v1.5)* Reacciones visibles para todos (íconos vectoriales desde v2.4). |
| RF-32 | *(v1.5)* Borrar solo mis trazos; auto-limpiar marcas al pasar de diapositiva. |
| RF-33 | *(v2.0)* Páginas compartidas; modo «marcas por diapositiva» en el overlay. |
| RF-34 | *(v2.0)* Seguir al presentador (vista del anfitrión). |
| RF-35 | *(v2.0)* Notas adhesivas y sellos. |
| RF-36 | *(v2.0)* Temporizador y votación rápida con un voto por persona. |
| RF-37 | *(v2.0)* Permitir a todos pasar diapositivas. |
| RF-38 | *(v2.0)* Exportar PDF multipágina; modo simple para celulares; `presentar.bat` con QR grande. |
| RF-39 | *(v2.1)* Fondo de hoja compartido: 7 diseños (puntos, cuadriculada, rayada, milimetrada, isométrica, pentagrama, lisa) y 5 papeles (blanco, crema, celeste, pizarra negra, pizarra verde). Lo cambia el anfitrión o quien tenga permiso. |
| RF-40 | *(v2.1)* Adjuntar imágenes (botón, arrastrar, pegar, cámara del celular) como elementos movibles y redimensionables con proporción fija. |
| RF-41 | *(v2.1)* Adjuntar PDF y archivos de Office como documento para hojear o como una diapositiva por página. Office se convierte a PDF en el PC anfitrión. |
| RF-42 | *(v2.1)* Anotaciones ancladas a la página de un documento: se ocultan al cambiar de página y acompañan al documento al moverlo o redimensionarlo. |
| RF-43 | *(v2.1)* Otros archivos como tarjeta descargable. |
| RF-44 | *(v2.1)* Trazos en vivo por trozos, cursores suavizados e indicador de latencia. |
| RF-45 | *(v2.2)* Paleta única para todos los pinceles, color personalizado con recientes, tamaño y opacidad en % y vista previa. |
| RF-46 | *(v2.2)* Fondo por página (o para todas), igual para todos los participantes. |
| RF-47 | *(v2.2)* Títulos de página y vista de páginas con miniaturas. |
| RF-48 | *(v2.2)* Cámaras configurables: forma, tamaño, ubicación, nombres y espejo. |
| RF-49 | *(v2.2)* Copiar, cortar, pegar, duplicar y seleccionar todo. |
| RF-50 | *(v2.2)* Cursores y láser por página; sin eco del cambio de página; reconexión al volver del segundo plano y detección de conexión muerta. |
| RF-51 | *(v2.2)* Interfaz adaptada a tablet (segunda fila) y celular (hoja inferior, objetivos táctiles). |
| RF-52 | *(v2.3)* Roles visita/editor/presentador administrados por el anfitrión (por persona, todos a la vez y rol por defecto), aplicados en el servidor y recordados por navegador. |
| RF-53 | *(v2.3)* Las visitas piden permiso para dibujar; el anfitrión lo concede desde un aviso. |
| RF-54 | *(v2.3)* Cada persona elige la forma de su cámara y dónde se ve: fija, siguiendo su puntero o anclada en la pizarra. |
| RF-56 | *(v2.4)* La cámara que sigue al puntero se ve con su forma y nombre junto al cursor, con movimiento suave. |
| RF-57 | *(v2.4)* Monigote neutro por defecto con animación fluida (predicción, suavizado y caminata articulada). |
| RF-58 | *(v2.4)* Interfaz sin emojis: reacciones, sellos y controles con íconos vectoriales. |
| RF-55 | *(v2.3)* Monigote con la cámara como cabeza: camina hacia el puntero, gravedad, superficies, salto, sillas para sentarse; color y figura personalizables. |

## 4. Reglas de negocio

- RN-01: El código de sala tiene 6 caracteres de un alfabeto sin ambigüedades (sin `0/O/1/l/i`).
- RN-02: Si una sala tiene PIN, nadie puede leer ni modificar su contenido sin el PIN correcto.
- RN-03: El PIN se guarda solo como hash `scrypt` con sal; nunca en texto plano.
- RN-04: Ante ediciones concurrentes de un mismo elemento gana la versión más alta
  (*last-writer-wins* por elemento); a igual versión, desempata un `nonce` aleatorio.
- RN-05: Borrar es un borrado lógico (`isDeleted`) para que deshacer y la sincronización funcionen.
- RN-06: Deshacer solo revierte acciones del propio usuario.
- RN-07: Una sala se cierra cuando lleva vacía el plazo configurado; tras reiniciar el servidor se
  concede ese mismo plazo de gracia para que la gente se reconecte.
- RN-08: Una sala cerrada no se puede recuperar: su archivo se borra.
- RN-12: Solo el anfitrión (clave entregada al crear la sala) puede proyectar, transmitir su
  pantalla y registrarse para el control remoto. En disco solo se guarda el hash de la clave.
- RN-10: Con permiso del anfitrión, un participante solo puede siguiente/anterior/inicio/fin/negro/
  blanco; la lupa y la transmisión siguen reservadas al QR de control.
- RN-11: Las cámaras se envían solo a quien proyecta (`display`), nunca a todos los participantes.
- RN-09: El control remoto exige la clave del PC presentador; el servidor la compara en tiempo
  constante, no la guarda en disco y nunca la reenvía. Las órdenes son de una lista blanca y se
  entregan solo al PC registrado.

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
| T-15 | Modo de sala (en blanco / en directo) | Elección al crear, diálogo de transmisión del anfitrión, aviso «Esperando…» | Terminado |
| T-16 | Vista móvil de la transmisión | Encaje automático, pantalla completa, reajuste al girar | Terminado |
| T-17 | Cierre de salas vacías | Barrido periódico con pruebas; recientes omite salas cerradas | Terminado |
| T-18 | Guardado concurrente seguro | Cola por sala en FileStore con prueba | Terminado |
| T-19 | Canal de control con clave | `control-register` / `control` con prueba de integración | Terminado |
| T-20 | Teclas en Windows | `keys.ps1` persistente con lista blanca de teclas | Terminado |
| T-21 | Lupa de Trazo | Ampliación con captura en vivo y marcas alineadas | Terminado |
| T-22 | Página de control móvil | `/control`: botones, deslizar, teclas, lupa con vista previa | Terminado |
| T-23 | HTTPS local | Certificado autogenerado con IPs de la red, puerto 3443, prueba de integración | Terminado |
| T-24 | Señalización WebRTC | Mensajes `rtc` dirigidos con prueba | Terminado |
| T-25 | Cámaras en el cliente | Emisor/receptor, burbujas, vista previa, cambio de cámara | Terminado |
| T-26 | Permiso de diapositivas | Pedir/permitir/quitar con prueba y botones ‹ › | Terminado |
| T-27 | Anfitrión único | Clave de anfitrión al crear, prueba «solo el anfitrión es la presentación principal», ★ en la UI | Terminado |
| T-28 | Fondos de hoja | Mensaje `background` con permiso, dibujo en coordenadas del mundo, selector con miniaturas, exportaciones | Terminado |
| T-29 | Almacén de adjuntos | `POST /api/rooms/:id/assets` con permiso firmado, límites, servir con `nosniff`/descarga, borrado con la sala, pruebas | Terminado |
| T-30 | Conversión de Office | PowerShell + COM (Office) y LibreOffice como respaldo, cola de una en una, prueba con LibreOffice | Terminado |
| T-31 | Documentos en el cliente | pdf.js, elementos `image`/`doc`/`file`, barra del documento, anclaje de anotaciones | Terminado |
| T-32 | Tiempo real | Mensaje `stroke` con deltas, capa de trazos en vivo, interpolación de cursores, `ping`/`pong` | Terminado |
| T-34 | Panel de estilo v2.2 | Paleta única, personalizado, % y vista previa | Terminado |
| T-35 | Fondo y títulos por página | Mensajes `background{page}` y `page-title`, vista de páginas, PDF con títulos | Terminado |
| T-36 | Cámaras configurables | Preferencias por equipo, 6 ubicaciones, 3 formas | Terminado |
| T-37 | Sincronización v2.2 | Página en cursor/láser, sin eco, reconexión inmediata | Terminado |
| T-38 | Pruebas v2.2 | Integración (47) + E2E `v22.py` (15) + regresión E2E | Terminado |
| T-39 | Roles en servidor | `role`, `peer-role`, `room-roles`, `role-request`; bloqueo de mensajes de edición para visitas | Terminado |
| T-40 | Panel de participantes | Rol por persona, todos, por defecto; aviso de solicitudes; barra de visita | Terminado |
| T-41 | Avatares | `avatar`/`avatar-pos`, física del monigote, sillas, modos puntero/anclado, diálogo | Terminado |
| T-42 | Pruebas v2.3 | Integración (48) + E2E `v23.py` (8) + regresión | Terminado |
| T-43 | Íconos | Sellos vectoriales (`stamp`), reacciones por clave, controles con SVG | Terminado |
| T-44 | Monigote fluido | Bucle por cuadro, velocidad en `avatar-pos`, predicción y suavizado, figura articulada | Terminado |
| T-45 | Pruebas v2.4 | E2E `v24.py` con cámara simulada (8) + regresión | Terminado |
| T-33 | Pruebas v2.1 | Unitarias e integración (46) + E2E `adjuntos.py` (12 comprobaciones) | Terminado |

## 9. Backlog — Trabajo futuro

- Varias pantallas principales sincronizadas en una sala (p. ej. dos proyectores).
- Audio opcional en las cámaras y silenciar por participante.
- Compartir la pantalla del celular (requiere app nativa o scrcpy en Android).

- Overlay en varios monitores (hoy cubre el monitor principal).
- Marcas que se desvanecen solas (modo puntero láser).
- Transmisión por WebRTC para más fluidez (hoy JPEG por WebSocket, ~6 cuadros/s).
- Instalador de la app de overlay (.exe) con inicio automático.

- Acceso desde internet mediante túnel gratuito (Cloudflare Tunnel o Tailscale).
- Estilo "a mano" tipo boceto (trazos irregulares).
- Redimensionar y rotar todos los tipos de elemento.
- Exportar a PDF cada página de un documento con sus anotaciones (hoy: la página visible).
- Recortar y rotar imágenes; buscar texto dentro de los documentos.
- Miniaturas de páginas del documento para saltar directo a una.
- Varias páginas por sala y plantillas.
- Compactación de elementos borrados (lápidas) antiguos.
- Exportar a SVG y a JSON; importar JSON.
- Aplicación instalable (PWA) y modo sin conexión.
