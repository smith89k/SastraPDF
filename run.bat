@echo off
title Sastra PDF
cd /d "%~dp0"
rem VS Code and tools launched from it set this; it makes electron.exe run as plain Node.
set ELECTRON_RUN_AS_NODE=
if not exist node_modules (
  echo Installing packages for the first run...
  call npm install || (pause & exit /b 1)
)
call npm start
