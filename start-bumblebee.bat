@echo off
setlocal

cd /d "%~dp0"
echo Starting Bumblebee Agent...
echo.

npm.cmd start

echo.
echo Bumblebee Agent stopped.
pause
