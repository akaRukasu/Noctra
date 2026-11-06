@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Relais Samsung 2014 - Noctra V8
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0MISE-A-JOUR-NOCTRA-DEPUIS-PC-V8.ps1" -Relay
set "NOCTRA_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %NOCTRA_EXIT%
