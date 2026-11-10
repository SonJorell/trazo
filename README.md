# Trazo

Pizarra colaborativa en tiempo real, **gratuita y autoalojada**. Corre en tu PC y la abres desde
el celular, una tablet u otro computador conectado a la **misma red Wi-Fi**. Sin cuentas, sin
servicios externos y sin internet.

- Lápiz, rectángulo, elipse, línea, flecha, texto y borrador
- Seleccionar, mover, redimensionar y eliminar; colores, relleno y grosor
- Zoom y desplazamiento con rueda, botones o **pellizco con dos dedos**
- Deshacer / rehacer, exportar a PNG, limpiar pizarra
- Varias personas a la vez: ves sus trazos **mientras dibujan**, sus cursores y sus nombres
- Salas con código corto, **PIN opcional** y enlace + **código QR** para el celular
- Al crear eliges **En blanco** o **En directo** (transmites tu pantalla y los demás marcan encima)
- En el celular la transmisión se ve **a pantalla completa** y se reajusta al girar el teléfono
- Las salas **se cierran solas** cuando no queda nadie (2 minutos después, configurable)
- **Control remoto desde el celular**: pasar diapositivas (PowerPoint, Google Slides, PDF, Canva,
  HTML) y **lupa** para ampliar una zona de la proyección
- **Cámaras de los participantes** sobre la presentación (solo video, por WebRTC en la red local)
- Los participantes pueden **pedir pasar diapositivas** y el anfitrión lo aprueba o lo quita
- Se guarda sola en disco; si se corta la Wi-Fi puedes seguir dibujando y se sincroniza al volver
- **Modo sobre la pantalla**: una capa transparente encima de todo para marcar sobre cualquier
  programa, y **transmisión de la pantalla del PC** a la sala para marcarla desde el celular

## Requisitos

- [Node.js](https://nodejs.org) 18.17 o superior (`node -v`)
- PC y celular en la misma red

## Instalación y uso

### Windows (rápido)

Doble clic en **`iniciar.bat`**. La primera vez instala las dependencias.

### Cualquier sistema

```bash
git clone <url-del-repositorio> trazo
cd trazo
npm install
npm start
```

La consola muestra algo así:

```
  En este PC:        http://localhost:3080
  Desde el celular:  http://192.168.1.50:3080
  [código QR]
```

1. En el PC abre `http://localhost:3080`, elige **En blanco** o **En directo** y pulsa **Crear pizarra**.
   En directo, el navegador te pedirá qué pantalla o ventana compartir (Chrome o Edge en el PC).
2. Dentro de la pizarra pulsa **Compartir**: aparece el enlace y un QR.
3. Escanéalo con la cámara del celular (misma Wi-Fi) y a dibujar.
4. Si la sala está en directo, en el celular toca **⛶** para verla a pantalla completa
   (gira el teléfono para verla más grande; **⤡** para salir).

> **Cierre automático**: cuando sale el último participante, la sala se cierra y se borra a los
> 2 minutos (`EMPTY_ROOM_TTL_MIN`). Exporta un PNG si quieres conservar el dibujo.

> **Firewall de Windows**: la primera vez Windows preguntará si permites a Node.js comunicarse.
> Marca **Redes privadas** y acepta. Si no aparece el aviso y el celular no conecta, revisa que la
> red Wi-Fi esté marcada como *privada* en la configuración de Windows.

## Dibujar sobre la pantalla (overlay)

Doble clic en **`iniciar-overlay.bat`**. La primera vez descarga Electron (unos 100 MB). Aparece
una píldora arriba a la derecha y un icono en la bandeja del sistema.

| Atajo | Acción |
|-------|--------|
| `Ctrl+Shift+D` | Alternar **Dibujar** ↔ **Usar el PC** (los clics atraviesan la capa) |
| `Ctrl+Shift+S` | Transmitir / detener la pantalla a la sala |
| `Ctrl+Shift+X` | Limpiar las marcas |
| `Ctrl+Shift+H` | Ocultar / mostrar la capa |
| `Ctrl+Shift+0` | Quitar la lupa |
| `Ctrl+Shift+Q` | Salir |

**Marcar la pantalla desde el celular**

1. En la capa pulsa **Dibujar** → **Invitar** (icono compartir) y escanea el QR con el celular.
2. Pulsa **Transmitir**. En el celular verás la pantalla del PC de fondo («Pantalla en vivo»).
3. Lo que dibujes en el celular aparece encima de la pantalla del PC, en el mismo lugar.

Notas:

- La capa se excluye de la captura, así la pantalla transmitida no la duplica.
- Solo se envían cuadros cuando hay alguien mirando; la calidad se ajusta sola (~6 cuadros/s).
- Si el servidor (`iniciar.bat`) ya está corriendo, el overlay lo usa; si no, lo inicia él mismo.
- Para depurar, `set TRAZO_OVERLAY_CAPTURABLE=1` deja la capa visible en capturas.
- La transmisión es para la red local: no la uses en redes públicas.

## Roles: presentación principal y participantes

| | **Presentación principal (anfitrión)** | **Participantes** |
|---|---|---|
| Qué es | La ventana del PC conectado al proyector o a la pantalla grande | Celulares, tablets u otros PC |
| Cómo se abre | `iniciar-overlay.bat` (encima de PowerPoint o de lo que sea) **o** la pizarra que creaste desde el inicio | Escaneando el QR de **Invitar / Compartir** |
| Puede | Proyectar, recibir cámaras, recibir el control de diapositivas, transmitir su pantalla, dar y quitar permisos | Dibujar y escribir, encender su cámara, pedir pasar diapositivas |
| Se reconoce por | **★** junto al código de la sala («★ Principal») | — |

Solo puede haber **una** presentación principal por sala: la de quien la **creó**. Al crearla,
el servidor le entrega una clave de anfitrión que guarda ese PC; nadie más puede proyectar,
transmitir ni registrarse para el control, aunque tenga el enlace.

Flujo recomendado para presentar:

1. En el PC del proyector abre tu presentación (PowerPoint, Slides, PDF…).
2. Doble clic en `iniciar-overlay.bat`: crea la sala y esa capa queda como **★ presentación principal**.
3. Pulsa **Invitar** en la barra del overlay y que los demás escaneen el QR.
4. Ellos dibujan, encienden su cámara o piden pasar diapositivas; tú apruebas desde el PC.
5. Para manejarlo tú desde tu celular, usa el QR de **Control remoto** (no lo muestres).

## Cámaras de los participantes

El anfitrión proyecta (con la app de overlay o desde la pizarra que creó) y los demás pueden
sumar su cámara, que aparece como una burbuja encima de la presentación.

1. Comparte la sala con **Compartir**: el QR apunta a la dirección **HTTPS**
   (`https://IP:3443`), porque el celular solo permite usar la cámara en páginas seguras.
2. La primera vez el celular avisará que la conexión «no es privada»: es tu propio PC con un
   certificado local. Toca **Avanzado → Continuar** (en iPhone: **Mostrar detalles → visitar el sitio**).
3. El participante pulsa el botón de **cámara** (arriba a la derecha). Puede cambiar entre la cámara
   frontal y la trasera, o apagarla desde su vista previa.
4. En el proyector, las burbujas se **arrastran**, cambian de tamaño con **doble clic** y se
   quitan con la **X**.

Las cámaras van directo del celular al PC por la red local (WebRTC, sin audio). Si una cámara no
llega, revisa que el firewall de Windows permita Node.js y Electron en redes privadas.

## Pasar diapositivas desde la pizarra (con permiso)

Con la app de overlay abierta, un participante puede elegir **☰ → Pedir pasar diapositivas**. En
el PC aparece «X quiere pasar las diapositivas»: **Permitir** o **Rechazar**. Al permitirlo, el
participante ve los botones **‹ ›**. El anfitrión quita el permiso desde el icono de
**personas** de la barra del overlay. Los permisos se borran al cerrar el overlay.

## Control remoto desde el celular (presentaciones)

Requiere la app de overlay abierta en el PC (`iniciar-overlay.bat`).

1. En el PC, en la barra del overlay pulsa **Control remoto** (icono de celular) o usa el menú de
   la bandeja. Escanea el QR con tu celular. **Ese QR lleva una clave secreta: no lo muestres al
   público.**
2. Abre tu presentación en el PC (PowerPoint, Google Slides, PDF, Canva o HTML) y déjala en primer plano.
3. En el celular:
   - **Anterior / Siguiente** (o desliza el dedo a izquierda o derecha sobre los botones).
   - **Iniciar** (F5), **Inicio**, **Fin**, **Negro** (B), **Blanco** (W) y **Salir** (Esc).
   - **Teclas**: *Flechas* (por defecto), *AvPág* (algunos visores de PDF) o *Espacio*.
   - **Lupa**: toca un punto del recuadro para ampliarlo 2×, pellizca para cambiar el zoom,
     arrastra para moverte y pulsa **Quitar zoom** para volver. Activa **Ver pantalla** para ver
     la pantalla del PC en el recuadro.
4. En el PC, `Ctrl+Shift+0` también quita la lupa.

Las teclas se envían a la ventana que esté en primer plano. Si estabas dibujando, Trazo le
devuelve el foco a la presentación antes de pulsar la tecla.

### Atajos de teclado

| Tecla | Acción | Tecla | Acción |
|-------|--------|-------|--------|
| `V` | Seleccionar | `T` | Texto |
| `P` | Lápiz | `E` | Borrador |
| `R` | Rectángulo | `H` | Mover vista |
| `O` | Elipse | `Espacio` + arrastrar | Mover vista |
| `A` | Flecha | `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `L` | Línea | `Supr` | Eliminar selección |
| `Mayús` al dibujar | Cuadrado / círculo / 45° | `Ctrl` + rueda | Zoom |

En el celular: un dedo dibuja, dos dedos mueven y hacen zoom. Doble toque sobre un texto (con
Seleccionar) para editarlo.

## Configuración

Variables de entorno (ver `.env.example`):

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `PORT` | `3080` | Puerto HTTP/WebSocket |
| `HOST` | `0.0.0.0` | `127.0.0.1` para que solo funcione en este PC |
| `DATA_DIR` | `data` | Carpeta donde se guardan las salas |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `EMPTY_ROOM_TTL_MIN` | `2` | Minutos que una sala vacía sigue abierta antes de borrarse |
| `HTTPS_PORT` | `3443` | Puerto HTTPS local (cámaras en el celular); `0` lo desactiva |
| `SWEEP_INTERVAL_MS` | `30000` | Cada cuánto se revisan las salas vacías |

Ejemplo en Windows: `set PORT=3090 && npm start`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia el servidor |
| `npm run dev` | Inicia y reinicia al guardar cambios |
| `npm test` | Pruebas unitarias y de integración (`node:test`) |
| `npm run lint` | Revisa el estilo del código con ESLint |
| `npm run check` | Lint + pruebas |
| `npm run overlay` | Instala Electron (si falta) y abre el modo sobre la pantalla |

## Estructura

```
server/   Servidor: HTTP, WebSocket, salas, persistencia
overlay/  App de escritorio (Electron) para dibujar sobre la pantalla
shared/   Modelo, geometría y protocolo (usados por servidor y navegador)
public/   Cliente sin compilación: HTML, CSS y módulos JS
tests/    Pruebas automáticas
docs/     Requerimientos, arquitectura, decisiones e informe
```

Detalle completo en [docs/arquitectura.md](docs/arquitectura.md).

## Documentación

- [Requerimientos, MVP y backlog](docs/requerimientos.md)
- [Arquitectura y protocolo](docs/arquitectura.md)
- [Bitácora de decisiones (ADR)](docs/decisiones.md)
- [Informe del proyecto](docs/informe.md)

## Flujo de trabajo (contribuir)

- Ramas: `main` (estable), `develop` (integración), `feature/<tema>` (cada cambio).
- Commits semánticos: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Antes de abrir un Pull Request hacia `develop`: `npm run check` debe pasar. Otra persona revisa
  el PR antes de integrarlo.

## Solución de problemas

| Problema | Solución |
|----------|----------|
| El celular no abre la página | Misma Wi-Fi; permitir Node.js en el firewall (redes privadas); usar la IP que muestra la consola, no `localhost` |
| «La conexión no es privada» | Normal con el certificado local: Avanzado → Continuar. Es necesario para la cámara |
| La cámara no aparece en el proyector | Abrir la sala por `https://…:3443`; permitir la cámara en el celular; firewall en redes privadas |
| «El puerto 3080 está ocupado» | Cierra la otra ventana de Trazo o usa `set PORT=3090` |
| Varias IP en la consola | Usa la que empieza por `192.168.` (suele ser la Wi-Fi) |
| Se perdió la conexión | Se reconecta sola; lo dibujado mientras tanto se envía al volver |

## Licencia

MIT. Ver [LICENSE](LICENSE).
