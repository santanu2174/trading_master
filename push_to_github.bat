@echo off
title Push Delta Trade Pro to GitHub
color 0B
echo ========================================================
echo   PUSH DELTA TRADE PRO TO GITHUB REPOSITORY
echo   Repo: https://github.com/santanu2174/trading_master.git
echo ========================================================
echo.

set GIT_EXE=C:\Users\santanu dutta\AppData\Local\Programs\Git\cmd\git.exe
if not exist "%GIT_EXE%" (
    set GIT_EXE=git
)

cd /d "%~dp0"

echo [1/3] Checking committed files...
"%GIT_EXE%" status
echo.

echo ========================================================
echo   GitHub Authentication
echo ========================================================
echo GitHub requires a Personal Access Token (Classic or Fine-Grained).
echo If you don't have one:
echo 1. Go to: https://github.com/settings/tokens
echo 2. Click 'Generate new token (classic)'
echo 3. Check 'repo' scope and click Generate.
echo ========================================================
echo.
set /p GITHUB_TOKEN="Enter your GitHub Personal Access Token (starts with ghp_): "

if "%GITHUB_TOKEN%"=="" (
    echo [INFO] No token entered. Attempting standard push...
    "%GIT_EXE%" push -u origin main
) else (
    echo [INFO] Pushing with provided token to santanu2174/trading_master...
    "%GIT_EXE%" remote set-url origin https://santanu2174:%GITHUB_TOKEN%@github.com/santanu2174/trading_master.git
    "%GIT_EXE%" push -u origin main
)

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   SUCCESS! Project has been saved to:
    echo   https://github.com/santanu2174/trading_master
    echo ========================================================
) else (
    echo [ERROR] Push failed. Please check your token permissions (repo scope).
)

echo.
pause
