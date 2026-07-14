@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "BACKEND_DIR=%~dp0smartchurch_backend"
set "VENV_PY=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    echo ERROR: Backend virtual environment was not found.
    echo Run install_windows.bat first to create smartchurch_backend\.venv and install dependencies.
    exit /b 1
)

"%VENV_PY%" --version >nul 2>nul
if errorlevel 1 (
    echo ERROR: Backend virtual environment is broken or points to a missing Python installation.
    echo Delete smartchurch_backend\.venv, then run install_windows.bat again.
    exit /b 1
)

echo Starting Docker database and frontend...
docker compose up -d db frontend
if errorlevel 1 (
    echo ERROR: Docker database/frontend startup failed.
    exit /b 1
)

cd /d "%BACKEND_DIR%"
echo Starting SmartChurch backend at http://0.0.0.0:8000
"%VENV_PY%" -m uvicorn smartchurch_backend.asgi:application --host 0.0.0.0 --port 8000 --reload

endlocal
