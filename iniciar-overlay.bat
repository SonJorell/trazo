@echo off
rem Inicia Trazo "sobre la pantalla": ventana transparente para dibujar encima de todo.
rem Si el servidor de Trazo no esta corriendo, el overlay lo inicia por su cuenta.
cd /d "%~dp0"
title Trazo - sobre la pantalla

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado. Descargalo de https://nodejs.org e intentalo de nuevo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias del servidor...
  call npm install --omit=dev
  if errorlevel 1 goto error
)

if not exist overlay\node_modules\electron (
  echo Instalando Electron por primera vez ^(unos 100 MB^)...
  pushd overlay
  call npm install
  if errorlevel 1 (
    popd
    goto error
  )
  popd
)

echo.
echo   Trazo sobre la pantalla
echo   Ctrl+Shift+D  dibujar / usar el PC
echo   Ctrl+Shift+S  transmitir la pantalla a la sala
echo   Ctrl+Shift+X  limpiar marcas
echo   Ctrl+Shift+H  ocultar / mostrar
echo   Ctrl+Shift+Q  salir
echo.
if "%PORT%"=="" set PORT=3080
cd overlay
call npx electron .
exit /b 0

:error
echo Error instalando dependencias.
pause
exit /b 1
