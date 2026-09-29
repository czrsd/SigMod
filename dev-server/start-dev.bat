@echo off
title SigMod Development Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found in PATH.
    echo Install Node.js, reopen this folder, then run start-dev.bat again.
    pause
    exit /b 1
)
node dev-server.mjs
pause
