@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title AI LA TRIEU PHU - QUIZ LIVE

set "QUIZ_PORT=8093"
if defined PORT set "QUIZ_PORT=%PORT%"
if not defined PORT if exist ".env" for /f "tokens=1,* delims==" %%A in ('findstr /B "PORT=" ".env"') do set "QUIZ_PORT=%%B"

where node >nul 2>&1
if errorlevel 1 (
  echo Khong tim thay Node.js. Can cai Node.js 22/24 de chay quiz.
  pause
  exit /b 1
)

node -e "const r=require('http').get('http://127.0.0.1:%QUIZ_PORT%/api/state',x=>{x.resume();process.exit(x.statusCode===200?0:1)});r.setTimeout(1500,()=>r.destroy());r.on('error',()=>process.exit(1));" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo Quiz dang chay tren cong %QUIZ_PORT% o mot cua so khac.
  echo Trang dieu khien: http://127.0.0.1:%QUIZ_PORT%/admin
  echo Man hinh live:   http://127.0.0.1:%QUIZ_PORT%/live
  echo Cua so nay se duoc giu mo. De xem log server tai day, dung phien cu roi click dup PLAY_QUIZ.bat.
  echo.
  if not defined QUIZ_NO_BROWSER start "" "http://127.0.0.1:%QUIZ_PORT%/admin"
  pause
  exit /b 0
)

if not exist "node_modules\tiktok-live-connector" (
  echo Dang cai thu vien can thiet...
  call npm install
  if errorlevel 1 (
    echo Cai thu vien that bai. Kiem tra ket noi mang va thu lai.
    pause
    exit /b 1
  )
)

echo.
echo Trang dieu khien: http://127.0.0.1:%QUIZ_PORT%/admin
echo Man hinh live:   http://127.0.0.1:%QUIZ_PORT%/live
echo Dia chi cho dien thoai hien trong trang dieu khien.
echo Giu cua so nay mo trong luc phat live. Nhan Ctrl+C de dung.
echo.
if not defined QUIZ_NO_BROWSER start "" "http://127.0.0.1:%QUIZ_PORT%/admin"
node launcher.js
set "QUIZ_EXIT=%ERRORLEVEL%"
echo.
echo Quiz da dung. Ma thoat: %QUIZ_EXIT%
pause
exit /b %QUIZ_EXIT%
