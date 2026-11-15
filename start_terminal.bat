@echo off
title Delta Trade Pro Terminal
cd /d "%~dp0"
echo ====================================================
echo Starting Delta Exchange Futures Trade Analyzer...
echo URL: http://localhost:3000
echo ====================================================

timeout /t 2 >nul
start http://localhost:3000

if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
    "%APPDATA%\Antigravity\bin\agy-node.cmd" server.js
    goto end
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.js
    goto end
)

echo Node.js not found.
pause

:end
