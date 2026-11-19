@echo off
title 1M / 5M Scalp Scanner (Offline / Standalone Mode)
cd /d "%~dp0"
echo ========================================================
echo   1M / 5M SCALP SCANNER - STANDALONE OFFLINE MODE
echo   No Node.js or server required! Running 100%% in Browser.
echo ========================================================
echo Opening 1M/5M Scalp Scanner in your default web browser...
start "" "%~dp0public\1min_scanchart.html"
exit
