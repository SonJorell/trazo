@echo off
rem Inicia Trazo en Windows. Doble clic para arrancar.
cd /d "%~dp0"
title Trazo - pizarra colaborativa

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado. Descargalo de https://nodejs.org e intentalo de nuevo.
  pause
  exit /b 1
)

if not exist node_modules\pdfjs-dist (
  echo Instalando dependencias por primera vez...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Error instalando dependencias.
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=3080
node server\index.js
pause
