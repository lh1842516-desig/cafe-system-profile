@echo off
chcp 65001 >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\CafeSystem.lnk"

if exist "%LINK%" (
  del "%LINK%"
  echo تم إلغاء التشغيل التلقائي.
) else (
  echo لا يوجد تشغيل تلقائي مثبت.
)
echo.
pause
