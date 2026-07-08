@echo off
chcp 65001 >nul
echo إيقاف خادم نظام الكافيه على المنفذ 3000...
set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  echo إيقاف العملية PID %%P ...
  taskkill /F /PID %%P >nul 2>&1
)
if "%FOUND%"=="1" (
  echo تم إيقاف السيرفر.
) else (
  echo السيرفر غير شغال على المنفذ 3000.
)
echo.
pause
