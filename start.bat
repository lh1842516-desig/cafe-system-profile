@echo off
chcp 65001 >nul
title نظام إدارة الكافيه
cd /d "%~dp0backend"

if not exist "node_modules" (
    echo تثبيت الحزم...
    call npm install
)

echo.
echo تشغيل الخادم...
echo افتح المتصفح على: http://localhost:3000
echo.
start http://localhost:3000
node server.js
pause
