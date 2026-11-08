@echo off
chcp 65001 > nul
cd /d "%~dp0"
title The Seven Emirates - Interactive Full HD Book
where py > nul 2>&1
if %errorlevel% equ 0 (
    py start_server.py
    goto :end
)
where python > nul 2>&1
if %errorlevel% equ 0 (
    python start_server.py
    goto :end
)
echo Python is not installed. Open this folder in VS Code and use the Live Server extension on index.html.
echo IMPORTANT: choose Trust this folder in VS Code first.
pause
:end
