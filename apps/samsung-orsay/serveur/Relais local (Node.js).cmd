@echo off
rem Noctra pour Samsung Smart TV 2014 : relais local HTTP vers le serveur HTTPS.
rem Nécessite Node.js 18 ou plus récent (https://nodejs.org). Laissez cette fenêtre ouverte.
where node >nul 2>nul || (echo Node.js est introuvable : installez-le depuis https://nodejs.org puis relancez. & pause & exit /b 1)
node "%~dp0noctra-samsung2014.mjs" relais %*
pause
