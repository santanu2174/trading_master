@echo off
title Delta Exchange Futures Trade Analyzer
color 0A
echo ========================================================
echo   DELTA EXCHANGE PRO FUTURES TRADE ANALYZER & AUTOMATION
echo ========================================================
echo Starting local analysis engine with agy-node...
cd /d "%~dp0"
start "" http://localhost:3000
agy-node server.js
pause
