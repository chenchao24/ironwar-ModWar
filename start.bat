@echo off
cd /d "%~dp0"
title IronWar Tank Server

echo Checking for existing node processes...
taskkill /f /im node.exe 2>nul

echo Starting IronWar Tank server...
start "IronWar Tank" /min node server.js

timeout /t 2 /nobreak >nul
echo.
echo Server running at http://localhost:8080
echo Opening browser...
start "" http://localhost:8080
echo.
echo Press Ctrl+C or close this window to stop.
echo.
cmd /k