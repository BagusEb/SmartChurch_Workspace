@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "BACKEND_DIR=%~dp0smartchurch_backend"
set "VENV_PY=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "REQUIREMENTS=%BACKEND_DIR%\requirements.txt"

echo SmartChurch Windows setup
echo =========================
echo.

echo [1/7] Creating backend virtual environment...
if not exist "%BACKEND_DIR%" (
    echo ERROR: Backend folder not found: "%BACKEND_DIR%"
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
if not exist "%VENV_PY%" (
    python -m venv "%BACKEND_DIR%\.venv"
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
) else (
    echo Existing virtual environment found: "%BACKEND_DIR%\.venv"
    "%VENV_PY%" --version >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Existing virtual environment is broken or points to a missing Python installation.
        echo Delete smartchurch_backend\.venv, then run install_windows.bat again.
        echo Press any key to exit...
        pause > nul
        exit /b 1
    )
)
echo.

echo [2/7] Preparing Python package installer...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 (
    echo ERROR: Failed to upgrade pip.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
echo.


@REM echo [3/7] Installing Python dependencies...
@REM "%VENV_PY%" -m pip install -r "%REQUIREMENTS%"
@REM if errorlevel 1 (
@REM     echo ERROR: Failed to install Python dependencies.
@REM     echo Press any key to exit...
@REM     pause > nul
@REM     exit /b 1
@REM )
@REM echo.

@REM echo [4/7] Reinstalling ONNX Runtime packages to ensure GPU support...
@REM "%VENV_PY%" -m pip uninstall -y onnxruntime onnxruntime-gpu
@REM if errorlevel 1 (
@REM     echo ERROR: Failed to uninstall existing ONNX Runtime packages.
@REM     echo Press any key to exit...
@REM     pause > nul
@REM     exit /b 1
@REM )
@REM "%VENV_PY%" -m pip install --no-cache-dir --force-reinstall onnxruntime-gpu
@REM if errorlevel 1 (
@REM     echo ERROR: Failed to reinstall onnxruntime-gpu.
@REM     echo Press any key to exit...
@REM     pause > nul
@REM     exit /b 1
@REM )

@REM echo.

echo [5/7] Checking ONNX Runtime providers...
"%VENV_PY%" -c "import onnxruntime as ort; providers = ort.get_available_providers(); print('ONNX Runtime providers:', ', '.join(providers)); raise SystemExit(0 if 'CUDAExecutionProvider' in providers else 2)"
if errorlevel 2 (
    echo WARNING: CUDAExecutionProvider is not active. ONNX Runtime will use CPU fallback.
) else (
    if errorlevel 1 (
        echo ERROR: Could not import onnxruntime. Check the dependency installation output above.
        echo Press any key to exit...
        pause > nul
        exit /b 1
    ) else (
        echo GPU ready: CUDAExecutionProvider is active.
    )
)
echo.

echo [6/7] Starting database for initial Django setup...
docker compose up -d db
if errorlevel 1 (
    echo ERROR: Docker database startup failed. Check if Docker Desktop is running.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)

echo Waiting for PostgreSQL to accept connections...
for /l %%i in (1,1,30) do (
    docker compose exec -T db pg_isready -h localhost -p 5432 >nul 2>nul
    if not errorlevel 1 goto db_ready
    timeout /t 2 /nobreak >nul
)
echo ERROR: PostgreSQL did not become ready in time.
echo Press any key to exit...
pause > nul
exit /b 1

:db_ready
echo Database is ready.
echo.

@REM echo [7/7] Running Django database setup...
pushd "%BACKEND_DIR%"
@REM "%VENV_PY%" manage.py migrate --noinput
@REM if errorlevel 1 (
@REM     popd
@REM     echo ERROR: Django migration failed.
@REM     echo Press any key to exit...
@REM     pause > nul
@REM     exit /b 1
@REM )

"%VENV_PY%" manage.py createsuperuser --noinput
if errorlevel 1 (
    echo Superuser already exists or DJANGO_SUPERUSER_PASSWORD is not set; continuing.
)

if exist temp.sql (
    type temp.sql | docker compose -f "%~dp0docker-compose.yml" exec -T db psql -U postgres -d smartchurch_db
    if errorlevel 1 (
        echo AI database role setup failed or role already exists; continuing.
    )
)

"%VENV_PY%" manage.py collectstatic --noinput
if errorlevel 1 (
    popd
    echo ERROR: collectstatic failed.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
popd
echo.

echo Stopping setup database container...
docker compose stop db
if errorlevel 1 (
    echo WARNING: Could not stop the database container. You can stop it later with: docker compose stop db
)
echo.

echo Building Docker frontend image...
docker compose build frontend
if errorlevel 1 (
    echo ERROR: Docker frontend build failed. Check if Docker Desktop is running
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
echo.

echo Setup complete.
echo Server startup: start_servers.bat
echo Frontend URL: http://localhost
echo Backend URL: http://localhost:8000
echo Run start_servers.bat when you are ready to start the full app.
echo Press any key to exit...
pause > nul

endlocal
