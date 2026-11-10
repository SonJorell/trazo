# Análisis: colaboración y presentación conjunta fluida

## Resumen ejecutivo

Trazo ya cubre lo esencial: una presentación principal (★) en el PC del proyector y
participantes que dibujan, encienden su cámara o piden pasar diapositivas. El análisis del
recorrido de cada rol muestra que lo que más frena la fluidez **no es la falta de funciones,
sino los pasos sueltos**: varias ventanas que abrir, una advertencia de certificado, marcas que
se quedan de una diapositiva a otra y ninguna forma rápida de señalar o reaccionar sin ensuciar.

En esta versión se resolvieron las fricciones de mayor impacto y menor esfuerzo:

- **Puntero láser** que se desvanece, para señalar sin ensuciar.
- **Reacciones** con emojis sobre la proyección.
- **Borrado automático** de las marcas al pasar de diapositiva.
- **«Borrar mis trazos».**
- **Pinceles**: marcador, resaltador y neón.
- **Colores**: paleta ampliada con colores neón.
- **Líneas**: discontinuas y punteadas, con opacidad regulable.

El resto queda priorizado en la hoja de ruta.

## Objetivos

- **General**: que un grupo pueda presentar y trabajar sobre la misma pantalla sin explicaciones
  previas y sin cortar el ritmo de la presentación.
- **Específicos**:
  1. Reducir a uno el número de pasos para cada acción frecuente (señalar, reaccionar, limpiar).
  2. Que las marcas acompañen a la diapositiva y no se acumulen.
  3. Dar herramientas visuales que se lean bien proyectadas (contraste, brillo, grosor).
  4. Mantener al anfitrión en control sin que tenga que estar pendiente del PC.

## Metodología

Se recorrió el flujo completo de cada rol (anfitrión en el PC, participante en el celular y
presentador moviéndose por la sala con el control remoto). Se anotó cada paso, espera o duda, y se
clasificó cada fricción por **impacto** (cuánto corta el ritmo de la presentación) y **esfuerzo**
(cuánto cuesta construirla bien).

## Diagnóstico por rol

### Anfitrión (PC del proyector)

| Fricción | Impacto | Estado |
|----------|---------|--------|
| Las marcas de una diapositiva quedan encima de la siguiente | Alto | **Resuelto**: «Auto-limpiar» al pasar diapositiva desde el control |
| Hay que abrir dos ventanas (`iniciar.bat` y `iniciar-overlay.bat`) | Medio | Hoja de ruta: el overlay ya inicia el servidor si falta; falta un único acceso directo |
| Aprobar cada solicitud de diapositivas interrumpe | Medio | Hoja de ruta: «Permitir a todos durante esta sesión» |
| Las teclas físicas del PC no disparan «Auto-limpiar» | Bajo | Limitación: el overlay no ve las teclas que van a PowerPoint |

### Participantes (celular)

| Fricción | Impacto | Estado |
|----------|---------|--------|
| Para señalar algo hay que dibujar y después borrar | Alto | **Resuelto**: puntero láser que se desvanece en ~1,3 s |
| No hay forma de reaccionar sin hablar o escribir | Medio | **Resuelto**: reacciones 👍 👏 ❤️ 😂 😮 🎉 ❓ ✋ |
| Borrar lo propio sin tocar lo de los demás | Medio | **Resuelto**: «Borrar mis trazos» (deshacible) |
| Advertencia de certificado la primera vez (cámara) | Medio | Documentado; hoja de ruta: certificado de confianza opcional (mkcert) |
| Pocos estilos que se lean bien proyectados | Medio | **Resuelto**: marcador, resaltador, neón, 18 colores (6 neón), líneas y opacidad |
| Muchas herramientas en pantalla chica | Bajo | Hoja de ruta: modo «solo anotar» simplificado para el celular |

### Presentador moviéndose por la sala

| Fricción | Impacto | Estado |
|----------|---------|--------|
| Hay que volver al PC para pasar diapositivas | Alto | Resuelto en v1.3 (control remoto con QR) |
| Hacer zoom en un detalle | Medio | Resuelto en v1.3 (lupa) |
| Ver en el celular qué diapositiva sigue | Medio | Hoja de ruta: vista previa de la siguiente diapositiva |

## Desarrollo técnico de lo implementado

- **Pinceles** (`brush`): `pen`, `marker` (×2,5 de grosor, opacidad 85 %), `highlighter`
  (×5, 38 %, mezcla *multiply* para no tapar el texto) y `neon` (halo con `shadowBlur` del color
  más núcleo blanco). El grosor efectivo (`effectiveWidth`) se usa también para detectar clics.
- **Líneas** (`dash`): continua, discontinua y punteada (`setLineDash`). **Opacidad** del 10 al
  100 %.
- **Autor** (`author`): cada navegador tiene un identificador estable que marca sus trazos, y así
  se pueden borrar solo los propios.
- **Láser**: mensajes `laser` efímeros (máx. 64 puntos por mensaje) que el servidor reenvía sin
  guardar. Cada participante usa su color de presencia. Las estelas se dibujan con brillo y se
  desvanecen.
- **Reacciones**: mensajes `reaction` restringidos a una lista de emojis, con un máximo de una
  cada 600 ms por persona.
- **Auto-limpiar**: botón en la barra del overlay, recordado en el PC. Al recibir
  siguiente, anterior, inicio o fin desde el control remoto, limpia la pizarra (se puede deshacer).

## Evidencias

- 36/36 pruebas automáticas, incluidas la validación de pinceles, líneas, opacidad y autor, el
  grosor efectivo al tocar un trazo, el reenvío del láser y el rechazo de reacciones no permitidas.
- Prueba visual en el navegador: lápiz, marcador, resaltador, neón, neón punteado, línea
  discontinua y elipse neón dibujados correctamente.

## Escalabilidad y trabajo futuro (priorizado)

Estado tras la versión 2.0: las prioridades 1 a 8 están **implementadas**. Quedan pendientes la 9
y la 10.

| Prioridad | Mejora | Impacto | Esfuerzo |
|-----------|--------|---------|----------|
| 1 | **Páginas por diapositiva**: guardar las marcas de cada diapositiva y recuperarlas al volver (en vez de borrarlas) | Alto | Medio |
| 2 | **Un solo acceso directo** «Presentar» que abra servidor + overlay e invite con un QR grande en pantalla | Alto | Bajo |
| 3 | **Permitir a todos** pasar diapositivas durante la sesión (sin aprobar uno por uno) | Medio | Bajo |
| 4 | **Seguir al presentador**: los participantes ven automáticamente lo que el anfitrión encuadra | Medio | Medio |
| 5 | Modo **«solo anotar»** para celulares: láser, lápiz, color y deshacer | Medio | Bajo |
| 6 | **Notas adhesivas** y **figuras/íconos** prediseñados (check, cruz, estrella, numeración) | Medio | Medio |
| 7 | **Temporizador** y **pregunta rápida** (votación con emojis contabilizada) | Medio | Medio |
| 8 | **Exportar PDF** con todas las páginas anotadas al terminar | Medio | Medio |
| 9 | Certificado de confianza opcional (mkcert) para evitar la advertencia | Bajo | Medio |
| 10 | Grabación de la sesión (pantalla + marcas) | Bajo | Alto |

## Conclusiones

Los cuatro objetivos específicos quedan atendidos en esta versión:

1. Señalar, reaccionar y limpiar lo propio cuestan un solo toque.
2. Las marcas pueden acompañar a la diapositiva con «Auto-limpiar».
3. Los pinceles neón, el marcador y el resaltador se leen bien proyectados.
4. El anfitrión mantiene el control con permisos y la presentación principal única (★).

El siguiente salto de fluidez está en **páginas por diapositiva** y en un **acceso único
«Presentar»**.
