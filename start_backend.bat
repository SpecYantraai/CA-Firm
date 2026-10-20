@echo off
TITLE Specentra AMS — Backend Server

SET SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%backend"

echo ============================================================
echo   Specentra AMS — Backend (FastAPI + Python)
echo   Stage 1 - File Explorer
echo ============================================================
echo.

echo [1/3] Checking dependencies...
python -m pip install --only-binary=:all: -r requirements.txt
if errorlevel 1 (
    echo Dependency installation failed. The backend has not been started.
    pause
    exit /b 1
)

echo [2/3] Upload directory ready.
if not exist "uploads" mkdir uploads

echo [3/3] Starting FastAPI server on http://localhost:8000
echo.
echo  API Docs:  http://localhost:8000/api/docs
echo  Health:    http://localhost:8000/api/health
echo.
echo  Default login:
echo    Admin:   admin@specentra.com   / Admin@123
echo    Partner: partner@specentra.com / Partner@123
echo.
echo  Press Ctrl+C to stop the server.
echo ============================================================

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
