@echo off
title Sastra PDF - build installer
cd /d "%~dp0"
rem VS Code and tools launched from it set this; it makes electron.exe run as plain Node.
set ELECTRON_RUN_AS_NODE=
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo [1/2] Installing packages (first time takes a few minutes)...
call npm install
if errorlevel 1 goto fail
echo [2/2] Building the Windows installer...
call npm run dist
if errorlevel 1 goto fail
echo.
echo Done. The installer is in the dist folder.
start "" "%~dp0dist"
pause
exit /b 0
:fail
echo.
echo Build failed. See the messages above, and the Troubleshooting section in README.md.
pause
exit /b 1
