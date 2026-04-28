@echo off
title GapGenius Backend
cd /d "%~dp0backend"

if not exist venv\Scripts\activate.bat (
    echo [ERROR] Virtual environment not found.
    echo Run: python -m venv venv ^&^& venv\Scripts\activate ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist .env (
    echo [WARN] .env not found. Copying from .env.example...
    copy .env.example .env
    echo [ACTION REQUIRED] Edit backend\.env and add your API key, then re-run this script.
    pause
    exit /b 1
)

call venv\Scripts\activate
echo [GapGenius] Backend starting on http://localhost:8000
echo [GapGenius] API docs at  http://localhost:8000/docs
echo.
uvicorn main:app --reload --port 8000
