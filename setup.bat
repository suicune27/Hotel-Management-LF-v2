@echo off
setlocal enabledelayedexpansion

title Link Fortress IT Solutions - Setup
cd /d "%~dp0"

:: ─── Colors ─────────────────────────────────────────────
set "ESC="
for /f "delims=#" %%a in ('"prompt #$E# & for %%b in (1) do rem"') do set "ESC=%%a"

set "GREEN=%ESC%[32m"
set "YELLOW=%ESC%[33m"
set "RED=%ESC%[31m"
set "CYAN=%ESC%[36m"
set "BOLD=%ESC%[1m"
set "RESET=%ESC%[0m"

:: ─── Banner ─────────────────────────────────────────────
cls
echo.
echo  %BOLD%╔══════════════════════════════════════════════╗%RESET%
echo  %BOLD%║     Link Fortress IT Solutions - Setup     ║%RESET%
echo  %BOLD%╚══════════════════════════════════════════════╝%RESET%
echo.
echo  %CYAN%This script will set up everything you need to run%RESET%
echo  %CYAN%the hotel management app on your machine.%RESET%
echo.

:: ─── 1. Node.js Check ──────────────────────────────────
echo  %BOLD%[1/7] Checking Node.js...%RESET%
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  %RED%[✕] Node.js is not installed or not in PATH.%RESET%
    echo.
    echo  Please install Node.js from: https://nodejs.org/
    echo  Choose the LTS version and make sure "Add to PATH" is checked.
    echo.
    echo  After installing, close this window and run setup.bat again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=1-3 delims=." %%a in ('node --version ^| findstr /r /c:"v[0-9]*\.[0-9]*\.[0-9]*"') do (
    set "NODE_MAJOR=%%a"
)
set "NODE_MAJOR=!NODE_MAJOR:~1!"
if !NODE_MAJOR! lss 18 (
    echo  %YELLOW%[⚠] Node.js !NODE_MAJOR! detected. Version 18+ is recommended.%RESET%
) else (
    echo  %GREEN%[✓] Node.js !NODE_MAJOR! detected%RESET%
)

:: ─── 2. npm install ────────────────────────────────────
echo.
echo  %BOLD%[2/7] Checking dependencies...%RESET%
if not exist "node_modules\" (
    echo  %YELLOW%  → node_modules not found. Running npm install...%RESET%
    echo.
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo  %RED%[✕] npm install failed. Check the error above.%RESET%
        pause
        exit /b 1
    )
    echo  %GREEN%[✓] Dependencies installed%RESET%
) else (
    echo  %GREEN%[✓] node_modules found%RESET%
)

:: ─── 3. Docker Check ────────────────────────────────────
echo.
echo  %BOLD%[3/7] Checking Docker...%RESET%

:: Check if docker command exists
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo  %RED%[✕] Docker is not installed.%RESET%
    echo.
    echo  Please install Docker Desktop for Windows:
    echo    https://www.docker.com/products/docker-desktop/
    echo.
    echo  After installing, launch Docker Desktop and run setup.bat again.
    echo.
    pause
    exit /b 1
)

:: Check if Docker daemon is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  %YELLOW%[⚠] Docker is installed but not running.%RESET%
    echo.
    echo  Please start Docker Desktop and wait for it to show:
    echo    "Docker Desktop is running" in the system tray.
    echo.
    echo  Then press any key to continue...
    pause >nul
    echo.
    docker info >nul 2>&1
    if !errorlevel! neq 0 (
        echo  %RED%[✕] Docker is still not running. Please start Docker Desktop manually.%RESET%
        pause
        exit /b 1
    )
)
echo  %GREEN%[✓] Docker is running%RESET%

:: ─── 4. Supabase CLI ────────────────────────────────────
echo.
echo  %BOLD%[4/7] Setting up Supabase CLI...%RESET%

:: Check if supabase CLI is available (via npx or global)
npx supabase --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  %YELLOW%  → Installing Supabase CLI as dev dependency...%RESET%
    call npm install supabase --save-dev
    if !errorlevel! neq 0 (
        echo  %RED%[✕] Failed to install Supabase CLI.%RESET%
        pause
        exit /b 1
    )
    echo  %GREEN%  → Supabase CLI installed%RESET%
) else (
    echo  %GREEN%[✓] Supabase CLI is available%RESET%
)

:: ─── 5. Initialize Supabase ─────────────────────────────
echo.
echo  %BOLD%[5/7] Initializing Supabase project...%RESET%

if not exist "supabase\config.toml" (
    if exist "supabase\" (
        echo  %YELLOW%  → supabase directory exists but may be incomplete.%RESET%
    )
    echo  %YELLOW%  → Running supabase init...%RESET%
    call npx supabase init
    if !errorlevel! neq 0 (
        echo  %RED%[✕] Failed to initialize Supabase project.%RESET%
        pause
        exit /b 1
    )
    echo  %GREEN%  → Supabase project initialized%RESET%
) else (
    echo  %GREEN%[✓] Supabase project already initialized%RESET%
)

:: ─── 6. Start Supabase ─────────────────────────────────
echo.
echo  %BOLD%[6/7] Starting Supabase services...%RESET%
echo  %YELLOW%  (First start may take several minutes to download Docker images)%RESET%
echo.

:: Check if already running
npx supabase status --output json > "%TEMP%\supabase_status.json" 2>&1
if %errorlevel% neq 0 (
    echo  %YELLOW%  → Starting Supabase...%RESET%
    echo.
    call npx supabase start
    if !errorlevel! neq 0 (
        echo.
        echo  %RED%[✕] Failed to start Supabase.%RESET%
        echo  Check that Docker Desktop is running and has finished starting up.
        pause
        exit /b 1
    )
    echo.
    echo  %GREEN%[✓] Supabase services started%RESET%
) else (
    echo  %GREEN%[✓] Supabase is already running%RESET%
)

:: ─── 7. Apply Schema & Create .env ──────────────────────
echo.
echo  %BOLD%[7/7] Applying database schema...%RESET%

call npx supabase db execute --file schema.sql
if %errorlevel% neq 0 (
    echo  %YELLOW%  (tables may already exist — continuing)%RESET%
) else (
    echo  %GREEN%[✓] Schema applied%RESET%
)

:: Generate .env file from Supabase status
echo.
echo  %BOLD%Generating .env file...%RESET%

:: Save fresh status output
npx supabase status --output json > "%TEMP%\supabase_status.json" 2>&1

:: Use PowerShell to parse JSON and write .env
powershell -Command ^
    $status = Get-Content '%TEMP%\supabase_status.json' -Raw | ConvertFrom-Json; ^
    $envContent = @( ^
        '# Auto-generated by setup.bat — do not commit'; ^
        "VITE_SUPABASE_URL=`"$($status.api_url)`""; ^
        "VITE_SUPABASE_ANON_KEY=`"$($status.anon_key)`""; ^
        'ISLOCAL="true"'; ^
        '' ^
    ) -join [Environment]::NewLine; ^
    Set-Content -Path '.env' -Value $envContent -Encoding UTF8

if %errorlevel% neq 0 (
    echo  %RED%[✕] Failed to generate .env file.%RESET%
    pause
    exit /b 1
)

echo  %GREEN%[✓] .env file created with local Supabase credentials%RESET%

:: ─── Extract values from status JSON ────────────────
for /f "tokens=1,* delims=:" %%a in ('powershell -Command ^
  "$s = Get-Content '%TEMP%\supabase_status.json' -Raw ^| ConvertFrom-Json; ^
   Write-Output ('STUDIO:' + $s.studio_url); ^
   Write-Output ('API:' + $s.api_url); ^
   Write-Output ('ANON:' + $s.anon_key)"') do (
  if "%%a"=="STUDIO" set "STUDIO_URL=%%b"
  if "%%a"=="API" set "API_URL=%%b"
  if "%%a"=="ANON" set "ANON_KEY=%%b"
)

del "%TEMP%\supabase_status.json" 2>nul

:: Sanity check — verify .env has actual credentials
findstr /c:"VITE_SUPABASE_URL=" .env >nul 2>&1
if %errorlevel% neq 0 (
  echo  %RED%[✕] .env file is missing credentials. Something went wrong.%RESET%
  pause
  exit /b 1
)
findstr /c:"VITE_SUPABASE_ANON_KEY=\"eyJ" .env >nul 2>&1
if %errorlevel% neq 0 (
  echo  %RED%[✕] .env file does not contain a valid anon key. Something went wrong.%RESET%
  pause
  exit /b 1
)
echo  %GREEN%[✓] .env file verified with valid credentials%RESET%

:: ─── Summary ────────────────────────────────────────────
cls
echo.
echo  %BOLD%%GREEN%╔══════════════════════════════════════════════╗%RESET%
echo  %BOLD%%GREEN%║         Setup Complete!                    ║%RESET%
echo  %BOLD%%GREEN%╚══════════════════════════════════════════════╝%RESET%
echo.
echo  %BOLD%Supabase Services:%RESET%
echo    API:    !API_URL!
echo    Studio: !STUDIO_URL!
echo.
echo  %BOLD%.env file:%RESET%
echo    Generated with local Supabase credentials
echo    ISLOCAL=true
echo.
echo  %BOLD%What would you like to do?%RESET%
echo.
echo    %CYAN%[1]%RESET%  Launch Desktop App (Electron)  %YELLOW%(recommended)%RESET%
echo    %CYAN%[2]%RESET%  Start Web Dev Server (Vite)
echo    %CYAN%[3]%RESET%  Start Production Server (Express)
echo    %CYAN%[4]%RESET%  Exit
echo.

:choice
set /p "option=%BOLD%Enter your choice (1/2/3/4): %RESET%"

if "!option!"=="1" (
    echo.
    echo  %CYAN%→ Launching Electron app...%RESET%
    echo.
    start "Link Fortress" cmd /c "title Link Fortress & npm run electron:dev"
    echo  %GREEN%Electron app starting — check the new window.%RESET%
    echo.
    timeout /t 3 >nul
    exit /b 0
)

if "!option!"=="2" (
    echo.
    echo  %CYAN%→ Starting Vite dev server on http://localhost:3000 ...%RESET%
    echo.
    call npm run dev
    exit /b 0
)

if "!option!"=="3" (
    echo.
    echo  %CYAN%→ Starting production server on http://localhost:3000 ...%RESET%
    echo.
    call npm run serve:local
    exit /b 0
)

if "!option!"=="4" (
    echo.
    echo  %GREEN%Goodbye! Run setup.bat again anytime.%RESET%
    timeout /t 2 >nul
    exit /b 0
)

echo  %RED%Invalid choice. Please enter 1, 2, 3, or 4.%RESET%
goto choice
