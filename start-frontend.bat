@echo off
title GapGenius Frontend
cd /d "%~dp0frontend"

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    echo Install Node.js from: https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo [GapGenius] Installing dependencies...
    npm install
)

echo [GapGenius] Frontend starting on http://localhost:5173
echo.
npm run dev
