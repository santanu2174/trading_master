@echo off
title Delta AI Chart Scanner (Offline / Standalone Mode)
cd /d "%~dp0"
echo ========================================================
echo   DELTA AI CHART SCANNER - STANDALONE OFFLINE MODE
echo   No Node.js or server required! Running 100%% in Browser.
echo ========================================================
echo Opening Chart Scanner in your default web browser...
start "" "%~dp0public\scan_chart.html"
exit
