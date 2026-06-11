@echo off
setlocal enabledelayedexpansion
title Link Fortress IT Solutions - Supabase Setup
cd /d "%~dp0"

cls
echo ====================================================
echo    Supabase Setup - Link Fortress IT Solutions
echo ====================================================
echo.
echo Working directory: %CD%
echo.
echo Auto-installing and starting Supabase services...
echo.

:: --------------------------------------------------
echo [1/5] Checking Docker...
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed.
    exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running.
    exit /b 1
)
echo [OK] Docker is running
echo.

:: --------------------------------------------------
echo [2/5] Checking Supabase CLI...

set "SUPABASE_CMD=supabase"

where supabase >nul 2>&1
if not errorlevel 1 goto supabase_found

echo Installing Supabase CLI...
call npm install -g supabase
if errorlevel 1 exit /b 1

for /f "delims=" %%p in ('where supabase 2^>nul') do set "SUPABASE_CMD=%%p"

:supabase_found
echo [OK] Supabase CLI ready
echo.

:: --------------------------------------------------
echo [3/5] Initializing project...

if not exist "supabase\config.toml" (
    call %SUPABASE_CMD% init >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Init failed
        exit /b 1
    )
    echo [OK] Project initialized
) else (
    echo [OK] Already initialized
)

echo.

:: --------------------------------------------------
echo [4/5] Starting Supabase stack...
echo This may take 2-10 minutes on first run...
echo.

call %SUPABASE_CMD% start

echo Waiting for containers to stabilize...
timeout /t 30 >nul

:: --------------------------------------------------
echo Checking Supabase readiness...

set "READY=0"
set "TRIES=0"

:check_status
set /a TRIES+=1

%SUPABASE_CMD% status >nul 2>&1

if !errorlevel! equ 0 (
    set "READY=1"
    goto status_ok
)

echo Waiting for Supabase... attempt !TRIES!/12
timeout /t 5 >nul

if !TRIES! lss 12 goto check_status

echo [ERROR] Supabase failed to start properly.
exit /b 1

:status_ok
echo [OK] Supabase is running
echo.

:: --------------------------------------------------
echo [5/5] Creating .env file...

%SUPABASE_CMD% status --output json > "%TEMP%\supabase.json" 2>nul

powershell -ExecutionPolicy Bypass -Command ^
"$s = Get-Content '%TEMP%\supabase.json' -Raw; ^
if([string]::IsNullOrWhiteSpace($s)){ exit 1 }; ^
$o = ConvertFrom-Json $s; ^
Set-Content -Path '.env' -Encoding UTF8 -Value ( ^
'# Auto-generated' + [Environment]::NewLine + ^
'VITE_SUPABASE_URL=' + $o.api_url + [Environment]::NewLine + ^
'VITE_SUPABASE_ANON_KEY=' + $o.anon_key + [Environment]::NewLine + ^
'ISLOCAL=true' + [Environment]::NewLine ^
)"

if errorlevel 1 (
    echo [ERROR] Failed to generate .env
    exit /b 1
)

del "%TEMP%\supabase.json" 2>nul

echo [OK] .env created successfully
echo.

:: --------------------------------------------------
cls
echo ====================================================
echo              SETUP COMPLETE
echo ====================================================
echo.
echo Supabase is now running locally
echo.
echo Studio: http://localhost:54323
echo API:    http://localhost:54321
echo.
echo You can now run:
echo   npm run dev
echo.