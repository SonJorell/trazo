# Historial de versiones

Cambios visibles para quien usa Trazo, de la versión más nueva a la más antigua. El detalle técnico
de cada versión (requerimientos, decisiones y evidencias de pruebas) está en [docs/informe.md](docs/informe.md)
y [docs/decisiones.md](docs/decisiones.md).

## 2.8.0

- **Flechas que se pegan a las formas**: dibuja una línea o flecha que empiece o termine sobre
  un rectángulo, elipse, nota, texto, imagen, documento, sello o silla; mientras la arrastras se
  resalta la forma a la que se pegará. Al mover o agrandar la forma, la flecha la sigue (también
  en los equipos de los demás, y *Deshacer* devuelve ambas juntas). Mantén **Alt** para no
  pegarla. Si mueves solo la flecha, se despega.
- **Guardar la sala** (anfitrión): menú → *Guardar la sala (.trazo)*. Descarga un archivo con
  todas las páginas, títulos, fondos, notas del presentador, lo dibujado y los adjuntos. Para
  retomarla —aunque la sala ya se haya cerrado o en otro PC—, en la portada usa *Abrir una sala
  guardada (.trazo)*: se crea una sala nueva con su contenido y quien la abre es el anfitrión.
  Máximo 200 MB por archivo. El archivo incluye las notas privadas: compártelo con cuidado.
- **Funciona en Safari**: se probó con WebKit (el motor de Safari). Se corrigió que la grabación
  en Safari generaba un video vacío.
- **Notas**: el clic que cierra el editor de una nota ya no crea otra nota vacía, y una nota que
  queda sin texto se quita sola.
- **Integración continua**: cada cambio que se sube a GitHub pasa por lint, pruebas y pruebas de
  punta a punta en Chrome, Firefox y WebKit (`.github/workflows/ci.yml`).

## 2.7.0

- **Grabar la sesión**: menú → *Grabar la sesión*. Elige **La pizarra** (lo dibujado, el fondo,
  los monigotes y las cámaras; funciona también en el celular) o **Una pantalla o ventana**
  (p. ej. PowerPoint con las marcas encima). Opcionalmente incluye tu micrófono. Mientras graba
  aparece un indicador rojo con el tiempo; al detener, el video (MP4 o WebM según el navegador)
  se descarga en tu equipo. Nada se sube al servidor.
- **Aplicación instalable (PWA)**: en el PC anfitrión abre `http://localhost:3080` y usa
  *Instalar app* (portada o menú) para tenerla como aplicación con su propio icono y ventana.
  Si se cae la red, muestra una página sin conexión en vez de un error.
  *Limitación*: los navegadores solo permiten instalar desde `localhost` o HTTPS con certificado
  de confianza. En el celular por la red local (HTTP o el certificado autofirmado) usa
  *Agregar a pantalla de inicio* del navegador: abre Trazo a pantalla completa, sin modo sin conexión.
- **Notas adhesivas que calzan con el texto**: al escribir, el editor ocupa exactamente la nota
  (mismo color, margen, letra e interlineado) y la nota **crece hacia abajo** para mostrar todo
  lo escrito. Las palabras muy largas se cortan igual que en el editor; si achicas la nota a mano,
  el texto que no cabe termina en «…».
- **Celular, tablet y horizontal revisados**: barra inferior que cabe en pantallas de 360 px,
  paneles (notas, cámara) como hojas inferiores, menús y diálogos con desplazamiento, temporizador
  que ya no tapa las herramientas en tablet, panel de estilo cerrado al girar el celular y
  avisos que no tapan los títulos de los diálogos.

## 2.6.0

- **Todos ven las cámaras de todos**: cada participante recibe las cámaras de los demás (en la
  red local, sin servidor de video). La presentación principal las recibe en calidad completa y
  los demás en calidad reducida; cada cámara se envía a como máximo 8 espectadores además de la
  presentación. Menú → *Ver las cámaras de todos* / *Ocultar las cámaras de los demás*. Las
  visitas no las reciben por defecto (pueden activarlo).
- Con eso, los **monigotes y las cámaras que siguen el puntero** muestran el video real en todos
  los equipos que las ven, no solo en la presentación.
- **Accesorios del monigote**: sombrero, gorra, lentes, audífonos, corona o moño.
- **Gestos**: al reaccionar, tu monigote levanta la mano, celebra con saltos, lanza corazones,
  muestra el pulgar arriba o se ríe.
- **Compartir la pantalla del celular**: los navegadores de Android e iPhone no permiten capturar
  la pantalla desde una página web (`getDisplayMedia` no existe en móviles), así que no se puede
  hacer con Trazo en el navegador. Alternativa: proyecta el celular en el PC (p. ej. *Enlace
  Móvil* de Windows o *scrcpy* para Android) y comparte esa ventana con *Transmitir mi pantalla*.

## 2.5.0

- **Organizar páginas**: en la vista de páginas (toca *Pág. N* abajo) cada página tiene botones
  para **mover antes/después**, **duplicar** y **borrar**. El servidor lo hace de una vez para
  todos, con sus títulos, fondos y notas.
- **Bloquear**: selecciona y toca el candado de la barra inferior. Lo bloqueado no se selecciona,
  mueve ni borra al anotar encima (un documento bloqueado se sigue hojeando con su barra).
  Para soltarlo: menú → *Desbloquear elementos de esta página*.
- **Notas del presentador**: botón de hoja en la barra inferior (solo el anfitrión). Notas por
  página que se guardan en la sala y nadie más ve.
- **Resultados de votación en CSV**: botón *CSV* en la tarjeta de la votación (se abre en Excel).

## 2.4.0

- **Cámara que sigue tu puntero**: la burbuja (con la forma que elijas) acompaña tu cursor con un
  leve retraso elástico y tu nombre debajo; el cursor ya no repite la etiqueta.
- **Monigote más fluido**: la física corre en cada cuadro de pantalla, se comparte posición y
  velocidad 20 veces por segundo y los demás la **predicen y suavizan**; las piernas y los brazos
  se animan según el movimiento que cada equipo ve (con rodillas y codos, rebote al caminar,
  inclinación, sombra y pose de salto). La figura **neutra** es la predeterminada.
- **Interfaz sin emojis**: reacciones, sellos, temporizador, barras y botones usan íconos
  vectoriales propios, para un aspecto profesional y idéntico en cualquier equipo.

## 2.3.0

### Roles y permisos

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

### Mi cámara y avatar (monigote)

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

## 2.2.0

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

## 2.1.0 — Fondos de hoja y archivos adjuntos

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

## 2.0.0 y anteriores

Pizarra en tiempo real, salas con PIN y QR, modo sobre la pantalla (overlay), transmisión de la
pantalla del PC, control remoto desde el celular, cámaras de los participantes, presentación
principal única, páginas, notas adhesivas, sellos, temporizador, votación rápida y exportar PDF.
Detalle por versión en [docs/informe.md](docs/informe.md).
