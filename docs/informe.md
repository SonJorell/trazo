# Informe del proyecto Trazo

## Resumen ejecutivo

**Problema.** Se buscaba una pizarra digital gratuita, parecida a Excalidraw, para dibujar desde el
celular u otros dispositivos conectados al PC. Excalidraw es libre, pero su colaboración en vivo
depende de Firebase (Google) y de un servidor de salas aparte, y el proyecto tiene ~700 archivos
TypeScript que hay que compilar.

**Solución.** Se construyó **Trazo** desde cero: un único servidor Node.js que corre en el PC y
sirve una pizarra web a cualquier dispositivo de la misma red Wi-Fi. Incluye lápiz, formas,
flechas, texto, borrador, selección, zoom con pellizco, deshacer/rehacer, exportación PNG, salas
con código y PIN opcional, cursores y nombres de participantes, y un QR para entrar desde el
celular. No usa servicios externos ni cuentas. Las salas se guardan en archivos JSON.

**Resultado.** El MVP está completo y funciona en el equipo del usuario
(`http://192.168.1.93:3080`). En la prueba real, el usuario dibujó desde otro dispositivo mientras
se dibujaba desde el PC, y ambos trazos aparecieron en vivo. Hay 24 pruebas automáticas que pasan
y el linter no reporta errores. El código está en un repositorio git con ramas y commits semánticos.

## Objetivos

**General.** Entregar una pizarra colaborativa en tiempo real, gratuita y autoalojada, que se use
desde el PC y el celular en la misma red.

| # | Objetivo específico | Medida de cumplimiento | Fase |
|---|---------------------|------------------------|------|
| OE1 | Definir alcance, MVP y arquitectura | `docs/requerimientos.md`, `docs/arquitectura.md`, ADR | Planificación |
| OE2 | Servidor con salas, PIN, persistencia y tiempo real | Pruebas de salas e integración WebSocket en verde | Servidor |
| OE3 | Cliente de dibujo usable con ratón y con el dedo | 7 herramientas, pellizco, deshacer, PNG | Cliente |
| OE4 | Sincronización en vivo entre dispositivos | Trazos visibles en otro dispositivo mientras se dibujan | Integración |
| OE5 | Proyecto autosuficiente y documentado | README, `iniciar.bat`, linter, pruebas, git | Entrega |

## Desarrollo técnico y metodología

- **Metodología.** Alcance y MVP primero (ver `docs/requerimientos.md`), con tickets T-01 a T-10 y
  una definición de "terminado". Lo que no entraba en el MVP se movió al backlog.
- **Arquitectura.** Servidor modular (`http`, `realtime`, `rooms`, `storage`), código compartido
  entre servidor y navegador (`shared/`) y cliente separado por capas (`core`, `render`, `tools`,
  `input`, `net`, `ui`). Diagramas y protocolo en `docs/arquitectura.md`.
- **Sincronización.** Regla *last-writer-wins* por elemento (versión + nonce), borrado lógico y
  deshacer basado en operaciones. Converge siempre, incluso tras una desconexión.
- **Seguridad.** Validación estricta de cada elemento, límites de tamaño y de frecuencia, PIN con
  `scrypt` y protección contra recorrido de rutas.
- **Stack.** Node.js ≥ 18 (`http` + `ws` + `qrcode`), HTML/CSS/JS nativo con Canvas 2D,
  `node:test` y ESLint 9. Cada elección está justificada en `docs/decisiones.md`.

## Evidencias y resultados

| Evidencia | Resultado |
|-----------|-----------|
| `npm test` (24 pruebas: modelo, geometría, salas, PIN, limitador e integración WebSocket) | 24/24 superadas |
| `npm run lint` (ESLint 9) | 0 errores, 0 avisos |
| Arranque en Windows con `iniciar.bat` | Muestra la URL local, la URL de la red (192.168.1.93) y un QR en consola |
| Crear sala y dibujar (lápiz, rectángulo, elipse, flecha, texto) en el navegador | Correcto |
| Segunda sesión en la misma sala | Ve los elementos existentes y los nuevos en vivo |
| Dispositivo del usuario en la sala MKXBC6 | Sus trazos («HOLA», figuras) y su cursor con nombre aparecieron en el PC en vivo |
| Diálogo «Compartir» | Muestra el enlace `http://192.168.1.93:3080/sala?room=mkxbc6` y su QR |
| Persistencia | `data/rooms/mkxbc6.json` guardado: 24 elementos (14 visibles) |
| Defecto encontrado en la prueba | Aparecía el texto «null» junto a los avatares → corregido (`fix/presencia-null`) |

## Escalabilidad y trabajo futuro

- **Más usuarios.** Una sala en memoria soporta decenas de participantes en una red local. Para
  más carga se pueden repartir las salas entre procesos y usar Redis para difundir los cambios. El
  `RoomManager` ya está separado del transporte.
- **Otra base de datos.** Basta con implementar `init/exists/load/save` (por ejemplo, con SQLite).
- **Acceso desde internet.** Con un túnel gratuito (Cloudflare Tunnel o Tailscale) y HTTPS. Antes
  de exponerlo conviene sustituir el PIN por un token largo.
- **Funciones.** Estilo de boceto a mano, imágenes, copiar y pegar, varias páginas, exportar SVG o
  JSON, PWA instalable y compactación de lápidas. El backlog completo está en
  `docs/requerimientos.md`.
- **Integraciones.** La API REST y el protocolo están documentados, así que se puede añadir un
  servidor MCP para que una IA dibuje en la pizarra.

## Conclusiones

| Objetivo | Resultado |
|----------|-----------|
| OE1 | Cumplido: requerimientos, MVP, backlog, arquitectura y 9 ADR documentados |
| OE2 | Cumplido: salas, PIN con hash, persistencia atómica y WebSocket probados automáticamente |
| OE3 | Cumplido: herramientas, selección, zoom con pellizco, deshacer y PNG funcionando |
| OE4 | Cumplido y validado con un dispositivo real del usuario dibujando en la misma sala |
| OE5 | Cumplido: README, `iniciar.bat`, linter, pruebas y repositorio con ramas y commits semánticos |

Trazo cumple el objetivo general sin costo ni dependencias externas. Hay una limitación conocida:
fuera de la red local hace falta un túnel, y queda registrada como trabajo futuro.

## Anexos y bibliografía

- Manual de instalación y uso: `README.md`.
- Requerimientos y backlog: `docs/requerimientos.md`.
- Arquitectura y protocolo: `docs/arquitectura.md`.
- Bitácora de decisiones: `docs/decisiones.md`.

Referencias (formato IEEE):

[1] Excalidraw contributors, "Excalidraw," GitHub repository, 2026. [Online]. Available: https://github.com/excalidraw/excalidraw

[2] OpenJS Foundation, "Node.js Documentation," 2026. [Online]. Available: https://nodejs.org/docs

[3] I. Fette and A. Melnikov, "The WebSocket Protocol," RFC 6455, IETF, Dec. 2011.

[4] WHATWG, "HTML Living Standard — The canvas element," 2026. [Online]. Available: https://html.spec.whatwg.org/multipage/canvas.html

[5] W3C, "Pointer Events Level 3," W3C Working Draft, 2026. [Online]. Available: https://www.w3.org/TR/pointerevents3/

[6] C. Percival and S. Josefsson, "The scrypt Password-Based Key Derivation Function," RFC 7914, IETF, Aug. 2016.

[7] M. Shapiro, N. Preguiça, C. Baquero and M. Zawirski, "Conflict-free Replicated Data Types," in *Proc. SSS 2011*, LNCS 6976, pp. 386–400.
