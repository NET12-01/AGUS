@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo.
echo ================================
echo   AGUS - Asistente personal
echo ================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Instala Node.js 20 o posterior desde https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%a in ('node -v ^| findstr /r "^v"') do set NODE_MAJOR=%%a
set NODE_MAJOR=!NODE_MAJOR:v=!
if !NODE_MAJOR! LSS 20 (
  echo ERROR: Tenes Node.js v!NODE_MAJOR!. Necesitas v20+.
  pause
  exit /b 1
)
echo Node.js OK.
if not exist node_modules\ (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo ERROR: Fallo la instalacion.
    pause
    exit /b 1
  )
)
if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Se creo .env. Edita OPENAI_API_KEY para activar la IA.
  )
)
echo Iniciando AGUS...
echo Abri http://127.0.0.1:3000
call npm start
pause