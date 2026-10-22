@echo off
:: ============================================================
:: SmartChurch IoT Attention-Grabber - Auto Start Script
:: Runs on Mini PC boot: starts relay server + React UI,
:: then opens the display in Edge kiosk (fullscreen) mode.
:: ============================================================

:: This script lives inside the repo root, so it locates itself
:: automatically — no manual path editing needed.
set REPO_PATH=%~dp0
:: Remove the trailing backslash for consistent path joining
if "%REPO_PATH:~-1%"=="\" set REPO_PATH=%REPO_PATH:~0,-1%

:: 1. Start the Python relay server (server.py)
start "IoT Relay Server" cmd /k "cd /d %REPO_PATH% && call .venv\Scripts\activate && python server.py"

:: Give the server a few seconds to initialize
timeout /t 5 /nobreak >nul

:: 2. Start the React interactive UI (built with npm run build)
start "IoT Frontend UI" cmd /k "cd /d %REPO_PATH%\frontend-IoT && npm run preview -- --port 5173"

:: Give the frontend a few seconds to be ready
timeout /t 8 /nobreak >nul

:: 3. Open Microsoft Edge in kiosk (fullscreen, no address bar) mode
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk http://localhost:5173/ --edge-kiosk-type=fullscreen --no-first-run

:: ============================================================
:: To exit kiosk mode manually during testing: Alt+F4
:: ============================================================