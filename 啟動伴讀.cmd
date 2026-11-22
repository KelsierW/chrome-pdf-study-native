@echo off
cd /d "%~dp0"
node bridge\server.mjs
if errorlevel 1 pause
