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
- Se guarda sola en disco; si se corta la Wi-Fi puedes seguir dibujando y se sincroniza al volver

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

1. En el PC abre `http://localhost:3080` y pulsa **Crear pizarra**.
2. Dentro de la pizarra pulsa **Compartir**: aparece el enlace y un QR.
3. Escanéalo con la cámara del celular (misma Wi-Fi) y a dibujar.

> **Firewall de Windows**: la primera vez Windows preguntará si permites a Node.js comunicarse.
> Marca **Redes privadas** y acepta. Si no aparece el aviso y el celular no conecta, revisa que la
> red Wi-Fi esté marcada como *privada* en la configuración de Windows.

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

Ejemplo en Windows: `set PORT=3090 && npm start`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia el servidor |
| `npm run dev` | Inicia y reinicia al guardar cambios |
| `npm test` | Pruebas unitarias y de integración (`node:test`) |
| `npm run lint` | Revisa el estilo del código con ESLint |
| `npm run check` | Lint + pruebas |

## Estructura

```
server/   Servidor: HTTP, WebSocket, salas, persistencia
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
| «El puerto 3080 está ocupado» | Cierra la otra ventana de Trazo o usa `set PORT=3090` |
| Varias IP en la consola | Usa la que empieza por `192.168.` (suele ser la Wi-Fi) |
| Se perdió la conexión | Se reconecta sola; lo dibujado mientras tanto se envía al volver |

## Licencia

MIT. Ver [LICENSE](LICENSE).
