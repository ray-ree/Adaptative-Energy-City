# ============================================================================
# Adaptive Energy City — Windows Startup Script
# ============================================================================
# Usage:  .\start.ps1
#
# What this does:
#   1. Kills any stale backend (port 8000) or frontend (port 5173) process.
#   2. Starts the Python FastAPI backend in a new terminal window.
#   3. Starts the Vite dev server in a new terminal window.
#   4. Waits until both services respond (with timeout).
#   5. Opens the City Dashboard AND Resident Dashboard in browser tabs.
#   6. Shows a "Launch Both Dashboards" fallback if the browser blocked popups.
#
# Requirements:
#   - Python 3.10+ with scikit-learn, fastapi, uvicorn, pandas, numpy, joblib
#   - Node.js 18+ with npm
# ============================================================================

$ErrorActionPreference = "Continue"

$BACKEND_PORT  = 8000
$FRONTEND_PORT = 5173
$BASE_PATH     = "/Adaptative-Energy-City"
$CITY_URL      = "http://localhost:$FRONTEND_PORT$BASE_PATH/"
$RESIDENT_URL  = "http://localhost:$FRONTEND_PORT$BASE_PATH/resident"
$BACKEND_URL   = "http://127.0.0.1:$BACKEND_PORT/health"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir    = Join-Path $ScriptDir "backend"
$FrontendDir   = $ScriptDir

# ── Colour helpers ─────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan   }
function Write-Ok    { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green  }
function Write-Warn  { param($msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Error2{ param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red    }

Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host "    Adaptive Energy City — Startup" -ForegroundColor Blue
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host ""

# ── 1. Kill stale processes on target ports ─────────────────────────────────
Write-Step "Checking for stale processes on ports $BACKEND_PORT and $FRONTEND_PORT…"

$killPort = {
    param($port)
    $pids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
             Select-Object -ExpandProperty OwningProcess)
    foreach ($p in $pids) {
        if ($p -and $p -ne 0) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
            Write-Warn "Killed existing process on port $port (PID $p)"
        }
    }
}

& $killPort $BACKEND_PORT
& $killPort $FRONTEND_PORT
Start-Sleep -Seconds 1

# ── 2. Start backend ─────────────────────────────────────────────────────────
Write-Step "Starting Python FastAPI backend on port $BACKEND_PORT…"
$backendProc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; python api.py" `
    -WindowStyle Normal -PassThru
Write-Ok "Backend process started (PID $($backendProc.Id))"

# ── 3. Start frontend ────────────────────────────────────────────────────────
Write-Step "Starting Vite dev server on port $FRONTEND_PORT…"
$frontendProc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoExit", "-Command", "cd '$FrontendDir'; npm run dev -- --port $FRONTEND_PORT" `
    -WindowStyle Normal -PassThru
Write-Ok "Frontend process started (PID $($frontendProc.Id))"

# ── 4. Wait for services to become ready ────────────────────────────────────
Write-Step "Waiting for backend to be ready (up to 30s)…"
$maxWait = 30; $waited = 0; $backendReady = $false
while ($waited -lt $maxWait) {
    try {
        $r = Invoke-WebRequest -Uri $BACKEND_URL -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $backendReady = $true; break }
    } catch { }
    Start-Sleep -Seconds 1; $waited++
}
if ($backendReady) { Write-Ok "Backend is ready at http://127.0.0.1:$BACKEND_PORT" }
else { Write-Warn "Backend did not respond in $maxWait s — it may still be starting." }

Write-Step "Waiting for frontend to be ready (up to 30s)…"
$waited = 0; $frontendReady = $false
while ($waited -lt $maxWait) {
    try {
        $r = Invoke-WebRequest -Uri $CITY_URL -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -lt 500) { $frontendReady = $true; break }
    } catch { }
    Start-Sleep -Seconds 1; $waited++
}
if ($frontendReady) { Write-Ok "Frontend is ready at http://localhost:$FRONTEND_PORT" }
else { Write-Warn "Frontend did not respond in $maxWait s — it may still be compiling." }

# ── 5. Open browser tabs ─────────────────────────────────────────────────────
Write-Step "Opening browser tabs…"
try {
    # Open city dashboard
    Start-Process $CITY_URL
    Start-Sleep -Milliseconds 800
    # Open resident dashboard in a second tab
    Start-Process $RESIDENT_URL
    Write-Ok "Opened City Dashboard:    $CITY_URL"
    Write-Ok "Opened Resident Dashboard: $RESIDENT_URL"
} catch {
    Write-Warn "Could not open browser automatically. Open these URLs manually:"
    Write-Host "    City Dashboard:     $CITY_URL"     -ForegroundColor White
    Write-Host "    Resident Dashboard: $RESIDENT_URL" -ForegroundColor White
}

# ── 6. Summary ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host "    ADAPTIVE ENERGY CITY IS RUNNING" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Blue
Write-Host ""
Write-Host "    City Dashboard     : $CITY_URL" -ForegroundColor White
Write-Host "    Resident Dashboard : $RESIDENT_URL" -ForegroundColor White
Write-Host "    Backend API        : http://127.0.0.1:$BACKEND_PORT" -ForegroundColor White
Write-Host "    API Docs (Swagger) : http://127.0.0.1:$BACKEND_PORT/docs" -ForegroundColor White
Write-Host ""
Write-Host "  [FALLBACK] If browser tabs did not open, paste these URLs:" -ForegroundColor Yellow
Write-Host "    $CITY_URL" -ForegroundColor Cyan
Write-Host "    $RESIDENT_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Close this window to stop monitoring these URLs." -ForegroundColor Gray
Write-Host "  The backend and frontend continue running in their own windows." -ForegroundColor Gray
Write-Host ""
