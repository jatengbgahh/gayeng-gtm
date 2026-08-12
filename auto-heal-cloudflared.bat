@echo off
title Cloudflared Auto-Healer Watchdog
color 0A
echo ================================================================
echo   CLOUDFLARED AUTO-HEALER WATCHDOG (AUTO RESTART ON TIMEOUT)
echo ================================================================
echo.
echo Monitoring network timeout every 30 seconds...
echo Press Ctrl+C to stop.
echo.

:loop
timeout /t 30 /nobreak >nul

:: Ping Cloudflare DNS 1.1.1.1 to detect request timeout / network drop
ping -n 2 1.1.1.1 >nul 2>&1

if %errorlevel% NEQ 0 (
    echo.
    echo [%date% %time%] ⚠️ [TIMEOUT DETECTED] Request timed out / internet disconnected!
    echo [%date% %time%] 🔄 Executing auto-restart on cloudflared service...
    
    net stop cloudflared
    timeout /t 4 /nobreak >nul
    net start cloudflared
    
    echo [%date% %time%] ✅ Service cloudflared successfully restarted!
    echo [%date% %time%] Waiting 20 seconds for tunnel stabilization...
    timeout /t 20 /nobreak >nul
)

goto loop
