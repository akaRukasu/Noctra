@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Reparation du serveur Noctra - V8
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0MISE-A-JOUR-NOCTRA-DEPUIS-PC-V8.ps1" -Repair
set "NOCTRA_EXIT=%ERRORLEVEL%"
echo.
if not "%NOCTRA_EXIT%"=="0" (
  echo [Noctra] La reparation a echoue. Consultez DERNIERE-ERREUR-NOCTRA.txt dans ce dossier.
)
pause
exit /b %NOCTRA_EXIT%
