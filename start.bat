@echo off
setlocal EnableDelayedExpansion
title MediTrace Startup
color 0A

echo.
echo  ==========================================
echo    MediTrace - AI Clinical Intelligence
echo  ==========================================
echo.

:: Get script directory - portable across any machine/path
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "VENV=%BACKEND%\venv"
set "UVICORN=%VENV%\Scripts\uvicorn.exe"
set "PIP=%VENV%\Scripts\pip.exe"
set "VPYTHON=%VENV%\Scripts\python.exe"

echo  Project root : %ROOT%
echo.

:: ──────────────────────────────────────────────────────────────
:: 1 - Check Python
:: ──────────────────────────────────────────────────────────────
echo [1/6] Checking Python...
where python >nul 2>&1
if errorlevel 1 goto :nopython

python --version > "%TEMP%\mt_pyver.txt" 2>&1
set /p PYVER= < "%TEMP%\mt_pyver.txt"
del "%TEMP%\mt_pyver.txt" >nul 2>&1
echo  [OK] %PYVER%
goto :checknode

:nopython
echo.
echo  [ERROR] Python not found!
echo  Install Python 3.10+ from: https://python.org
echo  Tick "Add Python to PATH" during install.
echo.
pause
exit /b 1

:: ──────────────────────────────────────────────────────────────
:: 2 - Check Node.js
:: ──────────────────────────────────────────────────────────────
:checknode
echo [2/6] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 goto :nonode

node --version > "%TEMP%\mt_nodever.txt" 2>&1
set /p NODEVER= < "%TEMP%\mt_nodever.txt"
del "%TEMP%\mt_nodever.txt" >nul 2>&1
echo  [OK] Node.js %NODEVER%
goto :venv

:nonode
echo.
echo  [ERROR] Node.js not found!
echo  Install Node.js 18+ from: https://nodejs.org
echo.
pause
exit /b 1

:: ──────────────────────────────────────────────────────────────
:: 3 - Python virtual environment
:: ──────────────────────────────────────────────────────────────
:venv
echo.
echo [3/6] Python virtual environment...

if exist "%VPYTHON%" goto :venv_exists

echo  Creating virtual environment - first run only, takes ~30 seconds...
python -m venv "%VENV%"
if errorlevel 1 goto :venv_err
echo  [OK] Virtual environment created
goto :pip

:venv_err
echo  [ERROR] Could not create virtual environment.
pause
exit /b 1

:venv_exists
echo  [OK] Virtual environment ready

:: ──────────────────────────────────────────────────────────────
:: Install pip packages (only if needed)
:: ──────────────────────────────────────────────────────────────
:pip
echo.
echo [4/6] Python packages...
if not exist "%BACKEND%\requirements.txt" goto :npm

:: Check if fastapi is already installed (quick check instead of reinstall)
"%VPYTHON%" -c "import fastapi" >nul 2>&1
if not errorlevel 1 (
    echo  [OK] Python packages already installed
    goto :npm
)

echo  Installing from requirements.txt - please wait, this may take 1-2 minutes...
"%PIP%" install -r "%BACKEND%\requirements.txt" --disable-pip-version-check 2>&1 | findstr /v "^WARNING: Cache"
if errorlevel 1 (
    echo  [WARN] pip install had errors. Retrying...
    "%PIP%" install -r "%BACKEND%\requirements.txt"
)
echo  [OK] Python packages ready

:: ──────────────────────────────────────────────────────────────
:: 5 - Node modules
:: ──────────────────────────────────────────────────────────────
:npm
echo.
echo [5/7] Node.js packages...

if exist "%FRONTEND%\node_modules" goto :npm_exists

echo  Running npm install - first run only, takes ~60 seconds...
pushd "%FRONTEND%"
call npm install --silent
if errorlevel 1 (
    echo  [WARN] npm install had errors. Running again with output visible...
    call npm install
)
popd
echo  [OK] Node modules installed
goto :dotenv

:npm_exists
echo  [OK] node_modules ready

:: ──────────────────────────────────────────────────────────────
:: 6 - .env file
:: ──────────────────────────────────────────────────────────────
:dotenv
echo.
echo [6/7] Environment configuration...

if exist "%BACKEND%\.env" goto :env_ok

if not exist "%BACKEND%\.env.example" goto :env_warn

copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
echo.
echo  [WARN] .env was missing - created from template.
echo  Add API keys to: %BACKEND%\.env
echo    GEMINI_API_KEY  - free at aistudio.google.com
echo    OPENAI_API_KEY  - platform.openai.com
echo  The app runs without them but AI features need keys.
echo.
timeout /t 5 /nobreak >nul
goto :port

:env_warn
echo  [WARN] No .env or .env.example found. AI features may fail.
goto :port

:env_ok
echo  [OK] .env found

:: ──────────────────────────────────────────────────────────────
:: Find free backend port
:: ──────────────────────────────────────────────────────────────
:port
set "PORT=8001"
echo  Freeing port 8001 for MediTrace backend...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%P /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo  [OK] Backend will use port 8001

echo  Freeing port 3000 for MediTrace frontend...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%P /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo  [OK] Frontend will use port 3000

:: Write frontend .env.local - always port 8001
> "%FRONTEND%\.env.local" echo NEXT_PUBLIC_API_URL=http://localhost:8001
echo  [OK] Frontend API configured for backend port 8001

:: ──────────────────────────────────────────────────────────────
:: 7 - Write helper bat files and launch servers
:: Uses helper files to avoid nested-quote problems
:: ──────────────────────────────────────────────────────────────
echo.
echo [7/7] Starting MediTrace servers...

:: Write backend launcher
set "BK=%TEMP%\meditrace_backend.bat"
(
    echo @echo off
    echo title MediTrace Backend - port !PORT!
    echo cd /d "!BACKEND!"
    echo echo.
    echo echo  Backend  : http://localhost:!PORT!
    echo echo  API Docs : http://localhost:!PORT!/docs
    echo echo  Press Ctrl+C to stop.
    echo echo.
    echo "!UVICORN!" main:app --reload --port !PORT!
    echo echo.
    echo echo  Backend stopped. Press any key to close.
    echo pause ^>nul
) > "%TEMP%\meditrace_backend.bat"

:: Write frontend launcher
set "FE=%TEMP%\meditrace_frontend.bat"
(
    echo @echo off
    echo title MediTrace Frontend - port 3000
    echo cd /d "!FRONTEND!"
    echo echo.
    echo echo  Frontend : http://localhost:3000
    echo echo  Press Ctrl+C to stop.
    echo echo.
    echo npm run dev -- --port 3000
    echo echo.
    echo echo  Frontend stopped. Press any key to close.
    echo pause ^>nul
) > "%TEMP%\meditrace_frontend.bat"

:: Launch both in separate windows
start "MediTrace Backend" cmd /k "%BK%"
timeout /t 4 /nobreak >nul
start "MediTrace Frontend" cmd /k "%FE%"
timeout /t 8 /nobreak >nul

:: Open browser
start "" "http://localhost:3000"

:: ──────────────────────────────────────────────────────────────
:: Done
:: ──────────────────────────────────────────────────────────────
echo.
echo  ==========================================
echo    MediTrace is running!
echo  ==========================================
echo.
echo    Frontend : http://localhost:3000
echo    Backend  : http://localhost:!PORT!
echo    API Docs : http://localhost:!PORT!/docs
echo.
echo    Admin    : admin@meditrace.com  / admin123
echo    Doctor   : doctor@meditrace.com / dr001
echo    Patient  : patient@meditrace.com / pt001
echo.
echo    Keep the server windows open while using the app.
echo    To stop: close the Backend and Frontend windows.
echo.
echo  Press any key to close this setup window...
pause >nul
endlocal
