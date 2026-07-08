@echo off
chcp 65001 >nul
set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "BACKEND=%PROJECT_DIR%\backend"
set "VBS=%BACKEND%\start-server.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\CafeSystem.lnk"

if not exist "%VBS%" (
  echo خطأ: لم يتم العثور على الملف %VBS%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%BACKEND%\create-startup-shortcut.ps1" "%LINK%" "%VBS%" "%BACKEND%"
if %ERRORLEVEL% neq 0 (
  echo فشل إنشاء اختصار التشغيل التلقائي.
  pause
  exit /b 1
)

echo تم تثبيت التشغيل التلقائي بنجاح.
echo سيتم تشغيل السيرفر عند كل تسجيل دخول لويندوز.
echo.
pause
