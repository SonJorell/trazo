# Trazo

Pizarra colaborativa en tiempo real, **gratuita y autoalojada**. Corre en tu PC y la abres desde
el celular, una tablet u otro computador conectado a la **misma red Wi-Fi**. Sin cuentas, sin
servicios externos y sin internet.

- Lápiz, rectángulo, elipse, línea, flecha, texto y borrador
- **Pinceles**: lápiz, marcador, resaltador y **neón**; 18 colores (6 neón) + personalizado;
  líneas continuas, discontinuas y punteadas; opacidad regulable
- **Puntero láser** que se desvanece solo y **reacciones** con íconos sobre la proyección
- **Páginas**: una por diapositiva (las marcas vuelven al regresar) o varias hojas de pizarra
- **Seguir al presentador**: los participantes ven lo mismo que encuadra el anfitrión
- **Notas adhesivas** y **sellos** vectoriales (visto bueno, estrella, números…), **temporizador** y **votación rápida**
- **Exportar PDF** con todas las páginas y **modo simple** para celulares
- **Presentar con un clic** (`presentar.bat`) con QR grande en el proyector
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
- Opcional, para adjuntar PowerPoint/Word/Excel: Microsoft Office **o** [LibreOffice](https://es.libreoffice.org/) (gratis) en el PC anfitrión. Los PDF e imágenes no necesitan nada más.

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
4. Si la sala está en directo, en el celular toca el botón **pantalla completa** para verla a pantalla completa
   (gira el teléfono para verla más grande; **⤡** para salir).

> **Cierre automático**: cuando sale el último participante, la sala se cierra y se borra a los
> 2 minutos (`EMPTY_ROOM_TTL_MIN`). Exporta un PNG si quieres conservar el dibujo.

> **Firewall de Windows**: la primera vez Windows preguntará si permites a Node.js comunicarse.
> Marca **Redes privadas** y acepta. Si no aparece el aviso y el celular no conecta, revisa que la
> red Wi-Fi esté marcada como *privada* en la configuración de Windows.

## Presentar con un clic

1. Abre tu presentación en el PC del proyector.
2. Doble clic en **`presentar.bat`**. Se abre la capa sobre la pantalla (y el servidor si no estaba
   abierto), se crea la sala y aparece un **QR grande** para que el público se una.
3. Durante la presentación, desde la barra del overlay:
   - **Marcas: por diapositiva / se borran / se quedan**: qué pasa con lo dibujado al pasar de
     diapositiva desde el control remoto o un participante con permiso. «Por diapositiva» guarda las
     marcas de cada una y las muestra de nuevo al volver.
   - **Temporizador** (1 a 15 min) y **Votación rápida** (Sí/No, A-D, De acuerdo/En desacuerdo, Bien/Regular/Mal, 1-5 o tus opciones).
   - **Personas → Permitir a todos** para que cualquiera pase diapositivas sin aprobar uno por uno.
   - **QR**: muestra u oculta el QR grande para el público.

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
| Se reconoce por | La etiqueta **Principal** (con una estrella) junto al código de la sala | — |

Solo puede haber **una** presentación principal por sala: la de quien la **creó**. Al crearla,
el servidor le entrega una clave de anfitrión que guarda ese PC; nadie más puede proyectar,
transmitir ni registrarse para el control, aunque tenga el enlace.

Flujo recomendado para presentar:

1. En el PC del proyector abre tu presentación (PowerPoint, Slides, PDF…).
2. Doble clic en `iniciar-overlay.bat`: crea la sala y esa capa queda como **presentación principal**.
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

## Herramientas para presentar en conjunto

- **Páginas** (abajo: ‹ Pág. 1/3 ›): el anfitrión, o quien tenga permiso, cambia de página para
  todos. En una pizarra en blanco funcionan como hojas; con diapositivas, una página por diapositiva.
- **Seguir al presentador**: tu vista acompaña lo que encuadra el anfitrión. Si la mueves a mano,
  aparece **Seguir** para volver.
- **Notas adhesivas** (`N`, 6 colores) y **sellos** (`S`: visto bueno, incorrecto, estrella, corazón, atención, pregunta, flecha, advertencia y números 1–4; son vectoriales y se pueden agrandar).
- **Modo simple** (menú ☰): en celulares de participantes viene activado; deja solo lápiz, láser,
  notas, sellos y borrador.
- **Exportar PDF** (menú ☰): una hoja por página, listo para compartir al terminar.

- **Puntero láser** (`K`): señala con una estela brillante que se borra sola en ~1 segundo. Cada
  persona tiene su color.
- **Reacciones** (botón de carita arriba a la derecha): me gusta, me encanta, divertido, sorprendente, celebrar, buena idea, duda y levantar la mano; flotan como íconos sobre la pantalla de
  todos, también sobre la proyección.
- **Borrar mis trazos** (menú ☰): elimina solo lo que dibujaste tú; se puede deshacer.
- **Auto-limpiar** (barra del overlay): al pasar de diapositiva desde el control remoto o con
  permiso, las marcas se borran solas (también se puede deshacer).

Análisis completo y hoja de ruta: [docs/analisis-mejoras.md](docs/analisis-mejoras.md).

## Fondos de hoja y archivos adjuntos (v2.1)

**Fondo de la hoja** (menú ☰ → *Fondo de la hoja*): puntos, cuadriculada, rayada (con margen),
milimetrada, isométrica, pentagrama o lisa, en papel blanco, crema, celeste, **pizarra negra** o
**pizarra verde**. Lo elige el anfitrión (o quien tenga permiso) y lo ven todos; también sale en
las exportaciones. En las pizarras oscuras la tinta negra se muestra blanca automáticamente.

**Adjuntar** (botón de clip de la barra, menú ☰, arrastrar y soltar, o `Ctrl+V`):

| Archivo | Cómo queda en la pizarra |
|---------|--------------------------|
| Foto o imagen (PNG, JPG, GIF, WebP; en el celular también la cámara) | Imagen que se mueve y se agranda (mantiene la proporción) |
| PDF, PowerPoint, Word, Excel, OpenDocument | Eliges: **documento para hojear** (‹ › en su barra o flechas del teclado) o **una página por diapositiva** (cada página va a una página de Trazo) |
| Cualquier otro archivo | Tarjeta: doble toque para descargarlo |

- Lo que dibujes **encima de un documento queda en esa página**: al pasar a la siguiente se
  oculta y vuelve al regresar. Si mueves o agrandas el documento, las anotaciones lo acompañan.
- Doble toque (con Seleccionar) sobre una imagen o documento lo encuadra en tu pantalla.
- PowerPoint/Word/Excel se convierten a PDF **en el PC anfitrión**, con Microsoft Office si está
  instalado o, si no, con [LibreOffice](https://es.libreoffice.org/) (gratis). Sin ninguno de los
  dos, el archivo queda como tarjeta descargable (puedes exportarlo tú como PDF y adjuntar el PDF).
- Límites: 40 MB por archivo, 300 MB por sala, 300 páginas por documento. Los archivos se borran
  junto con la sala.

## Novedades de la versión 2.4

- **Cámara que sigue tu puntero**: la burbuja (con la forma que elijas) acompaña tu cursor con un
  leve retraso elástico y tu nombre debajo; el cursor ya no repite la etiqueta.
- **Monigote más fluido**: la física corre en cada cuadro de pantalla, se comparte posición y
  velocidad 20 veces por segundo y los demás la **predicen y suavizan**; las piernas y los brazos
  se animan según el movimiento que cada equipo ve (con rodillas y codos, rebote al caminar,
  inclinación, sombra y pose de salto). La figura **neutra** es la predeterminada.
- **Interfaz sin emojis**: reacciones, sellos, temporizador, barras y botones usan íconos
  vectoriales propios, para un aspecto profesional y idéntico en cualquier equipo.

## Roles y permisos (v2.3)

El anfitrión abre **☰ → Participantes y permisos** (o toca los avatares de arriba):

| Rol | Puede |
|-----|-------|
| **Visita** | Mirar, reaccionar y votar. Ve una barra con *Pedir permiso para dibujar*. |
| **Editor** | Además dibujar, escribir, adjuntar, usar láser, cámara y monigote. |
| **Presentador** | Además pasar páginas/diapositivas y cambiar fondo y títulos. |

- **Quien entre desde ahora será…**: ideal para votaciones con mucha gente (elige *Visita*).
- **Todos a la vez**: pasa a todos a un rol con un toque (p. ej. «todos visita» para cerrar la pizarra).
- Cuando una visita pide permiso aparece un aviso con **Permitir / Ahora no**.
- El rol se recuerda: si alguien se desconecta y vuelve desde el mismo navegador, conserva el suyo.
- El servidor hace cumplir los permisos (una visita no puede dibujar aunque modifique la página).

## Mi cámara y avatar (monigote)

En **☰ → Mi cámara y avatar** (o el botón de carita junto a tu vista previa de cámara) cada persona elige:

- **Forma**: automática (la del anfitrión), círculo, redondeada o cuadrada.
- **Dónde se ve**: *fija en la presentación*, *sigue mi puntero*, *en un lugar de la pizarra*
  (tocas dónde dejarla) o **monigote**.
- **Monigote**: tu cámara es la cabeza de un personaje que **camina hacia tu puntero**, cae con
  gravedad, se para sobre figuras, notas, imágenes y documentos, **salta** para subirse a ellas y
  se **sienta en una silla** (*Agregar silla* → *Sentarme*). Eliges **color** y **figura**
  (hombre, mujer o neutro). Sin cámara, la cabeza muestra tus iniciales.
- Todos ven los monigotes; el video de las cámaras se ve en la presentación principal (y tú ves
  el tuyo).

## Novedades de la versión 2.2

- **Colores y pinceles**: una sola paleta para todos los pinceles (con el Neón brilla cualquier
  color), **color personalizado** con los últimos 6 usados, vista previa del trazo, y
  **tamaño y opacidad en %** con control deslizante y atajos rápidos.
- **Fondo por página**: en *Fondo de la hoja* eliges si se aplica a **todas las páginas** o
  **solo a la actual**. Todos ven siempre el mismo fondo en cada página (también a pantalla
  completa en el celular).
- **Títulos y vista de páginas**: toca *Pág. N* abajo para ver todas las páginas en miniatura,
  saltar a una o escribirle un título (lo ven todos y sale en el PDF).
- **Cámaras**: botón de cámara abajo a la derecha (en la presentación principal) para elegir **forma**
  (círculo, redondeada, rectángulo), **tamaño**, **ubicación** (libre, esquinas, fila, columna,
  cuadrícula), nombres y efecto espejo.
- **Copiar, pegar y duplicar**: `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+D`, `Ctrl+A`, y botón
  *Duplicar* junto a *Eliminar* (útil en el celular).
- **Sincronización**: los cursores y el láser solo se ven en la página donde están; al pasar
  páginas rápido ya no hay saltos; si el celular se bloquea o pierde la red, se reconecta solo
  al volver (y detecta conexiones «muertas» con el ping).
- **Interfaz**: en tablet la barra de herramientas baja a una segunda fila; en el celular el
  estilo se abre como hoja inferior a lo ancho, con botones más grandes para el dedo.

**Tiempo real más fluido**: los trazos viajan en vivo a trocitos (~60 veces por segundo) en lugar
de reenviar el trazo completo; los cursores de los demás se deslizan suavemente; junto al código
de la sala ves la **latencia** (verde < 80 ms, amarillo < 200 ms, rojo más).

### Atajos de teclado

| Tecla | Acción | Tecla | Acción |
|-------|--------|-------|--------|
| `V` | Seleccionar | `T` | Texto |
| `P` | Lápiz | `E` | Borrador |
| `K` | Puntero láser | `N` | Nota adhesiva |
| `S` | Sello | `←` / `→` | Página del documento activo |
| `Ctrl+C` / `Ctrl+V` | Copiar / pegar | `Ctrl+D` | Duplicar |
| `Ctrl+X` | Cortar | `Ctrl+A` | Seleccionar todo |
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
| `SOFFICE_PATH` | — | Ruta a `soffice` si LibreOffice no está en el lugar habitual |
| `TRAZO_NO_MSOFFICE` | — | `1` para no usar Microsoft Office al convertir (solo LibreOffice) |

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
| `python tests/e2e/sesion_completa.py` | Pruebas de punta a punta opcionales (Playwright; ver cabecera del archivo) |
| `python tests/e2e/v22.py` | Punta a punta de v2.2 (escritorio, tablet y celular) |
| `python tests/e2e/adjuntos.py` | Punta a punta de fondos, adjuntos, documentos y trazos en vivo |

## Estructura

```
server/   Servidor: HTTP, WebSocket, salas, persistencia, adjuntos y conversión de Office
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
- [Análisis de mejoras y hoja de ruta](docs/analisis-mejoras.md)

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
