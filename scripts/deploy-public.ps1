# Deploy the public web stack in the one order that works, with a hard gate at
# every step that has silently failed before.
#
# Why this exists: doing these steps by hand went wrong repeatedly, and each
# failure was invisible because the check that followed it was too weak.
#
#   1. Building while the old server is still up deletes, via `rm -rf .next`,
#      the exact chunk files that server is still handing out. The server keeps
#      running and keeps serving HTML that points at files that no longer exist,
#      so every page loads with no CSS. Nothing errors. The fix is not "remember
#      to stop it" - it is to refuse to build until port 3000 is provably free.
#
#   2. start-public.ps1 throws when port 3000 is taken. That throw goes to a log
#      nobody read, so a failed start looked identical to a good one and the
#      stale server kept serving for hours.
#
#   3. `curl -o /dev/null -w %{http_code}` returning 200 says the HTML was
#      served. It says nothing about whether the page works. A page whose whole
#      stylesheet 404s still answers 200. Readiness must mean every asset the
#      HTML references actually resolves.
#
#   4. The PID that Start-Process returns is a wrapper that exits within
#      seconds. Killing it stops nothing. The real processes are main.exe,
#      cloudflared, and whatever owns the port-3000 listener.
#
#   5. Starting the backend with a bare `go run main.go` looks identical to a
#      correct start and is not. It leaves gin in *debug* mode, so
#      isAllowedDevOrigin stays live and any loopback or private-IP origin on
#      port 3000 can send credentialed cross-origin requests; and it leaves
#      PUBLIC_BACKEND_URL unset, so upload URLs are built from the
#      client-supplied Host header and then persisted - including the PromptPay
#      QR customers scan to pay. Putting PUBLIC_BACKEND_URL in backend/.env does
#      not fix it: LoadRuntimeEnvironment returns early and never reads that
#      file when GIN_MODE=release. scripts/start-backend.ps1 -Mode public is the
#      only correct public start - it loads .env into the process itself, sets
#      PUBLIC_BACKEND_URL, pins GIN_MODE=release, and migrates first.
#
# ---------------------------------------------------------------------------
# Two ways to run this, and when each is right
#
# start-public.ps1 and start-dishy-tunnel.ps1 both BLOCK - they run node and
# cloudflared in the foreground and wait. That is deliberate: a blocking script
# can be run as a visible, manually stoppable task. Wrapping them in
# `Start-Process -WindowStyle Hidden`, which is what the one-shot mode below
# does, throws that away: the servers become hidden Windows processes with no
# window, no task entry, and nothing to click to stop.
#
#   -BuildOnly    steps 1-2 only (stop, prove port 3000 free, build), then exit.
#                 Start the three services yourself as blocking foreground
#                 commands so they stay visible and stoppable:
#                     repo root  scripts/start-backend.ps1 -Mode public
#                     frontend/  npm.cmd run start:public
#                     frontend/  npm.cmd run tunnel:public
#   -VerifyOnly   steps 6-8 only. Run this after starting them that way - it
#                 applies exactly the same readiness and asset gates the
#                 one-shot mode does, so nothing is given up by splitting.
#
# Prefer -BuildOnly + -VerifyOnly whenever a person is watching, so they can see
# the servers running and stop them without hunting for a PID. Use the one-shot
# mode for unattended runs.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-public.ps1
#   -SkipBuild   restart on the build already on disk
#   -Clean       delete .next first (only when the build is actually suspect;
#                a clean build changes every asset hash, which breaks any tab
#                that is already open)
#   -BuildOnly   stop + build, then hand off (see above)
#   -VerifyOnly  gates only, start nothing (see above)

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$Clean,
  [switch]$BuildOnly,
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 still negotiates TLS 1.0 by default, which Cloudflare
# refuses - without this every readiness probe throws and reports 0.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontend = Join-Path $root "frontend"
$logs = Join-Path $root "logs"

if ($BuildOnly -and $VerifyOnly) { throw "-BuildOnly and -VerifyOnly are mutually exclusive." }

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    ok  $text" -ForegroundColor Green }
function Die($text) { Write-Host "    FAIL  $text" -ForegroundColor Red; exit 1 }

# -SkipHttpErrorCheck is PowerShell 7+. On 5.1 a non-2xx throws, and the status
# has to be read back off the exception, or a 404 looks identical to no server.
function Get-Status([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 5
    return [int]$r.StatusCode
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  } catch { return 0 }
}

function Get-PortOwner([int]$port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.OwningProcess }
  return $null
}

function Stop-Port([int]$port) {
  $owner = Get-PortOwner $port
  if ($owner) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue }
}

# Steps 6-8. A function so -VerifyOnly applies the identical gates: splitting the
# deploy to keep the servers visible must not cost any verification.
function Test-PublicReady {
  # ------------------------------------------------------------- 6. ready ----
  Step 6 "Waiting for https://dishy.pro and https://api.dishy.pro"
  $web = 0; $api = 0
  for ($i = 0; $i -lt 45; $i++) {
    $web = Get-Status "https://dishy.pro/"
    $api = Get-Status "https://api.dishy.pro/readyz"
    if ($web -eq 200 -and $api -eq 200) { break }
    Start-Sleep -Seconds 4
  }
  if ($web -ne 200) { Die "dishy.pro returned $web" }
  if ($api -ne 200) { Die "api.dishy.pro returned $api" }
  Ok "dishy.pro 200, api.dishy.pro 200"

  # ------------------------------------------------------------ 7. assets ----
  # The check that would have caught the stale-server bug on the spot.
  Step 7 "Checking every asset the page references, not just the page"
  $html = (Invoke-WebRequest "https://dishy.pro/?next=%2Frestaurants" -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 20).Content
  $assets = [regex]::Matches($html, '/_next/static/[a-zA-Z0-9_./-]+\.(?:css|js)') |
    ForEach-Object { $_.Value } | Sort-Object -Unique
  if ($assets.Count -eq 0) { Die "no assets found in the HTML - the page is not what we think it is" }
  $broken = @()
  foreach ($a in $assets) {
    $code = Get-Status "https://dishy.pro$a"
    if ($code -ne 200) { $broken += "$code  $a" }
  }
  if ($broken.Count -gt 0) {
    Write-Host "    broken assets:" -ForegroundColor Red
    $broken | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
    Die "$($broken.Count) of $($assets.Count) assets do not resolve - the served HTML does not match the build on disk"
  }
  Ok "$($assets.Count) assets, all 200"

  # -------------------------------------------------------------- 8. pids ----
  Step 8 "Real process ids"
  $fePid = Get-PortOwner 3000
  Get-Process main, cloudflared -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host ("    {0,-14} {1}" -f $_.ProcessName, $_.Id) }
  Write-Host ("    {0,-14} {1}" -f "frontend node", $fePid)

  Write-Host "`nhttps://dishy.pro is live and verified.`n" -ForegroundColor Green
  Write-Host "Stop with (or just stop the tasks, if you started them yourself):" -ForegroundColor DarkGray
  Write-Host "  Get-Process main,cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force; Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force }" -ForegroundColor DarkGray
}

if ($VerifyOnly) {
  Write-Host "Verify-only: starting nothing, gating what is already running." -ForegroundColor DarkGray
  Test-PublicReady
  exit 0
}

# ---------------------------------------------------------------- 1. stop ----
Step 1 "Stopping the frontend and proving port 3000 is free"
Stop-Port 3000
for ($i = 0; $i -lt 10; $i++) {
  if (-not (Get-PortOwner 3000)) { break }
  Start-Sleep -Milliseconds 500
  Stop-Port 3000
}
$owner = Get-PortOwner 3000
if ($owner) { Die "port 3000 still held by PID $owner - build would delete files it is serving" }
Ok "port 3000 free"

# --------------------------------------------------------------- 2. build ----
if (-not $SkipBuild) {
  if ($Clean) {
    Step 2 "Clean build (every asset hash changes; open tabs will need a reload)"
    Remove-Item -Recurse -Force (Join-Path $frontend ".next") -ErrorAction SilentlyContinue
  } else {
    Step 2 "Building (incremental: unchanged chunks keep their hashes)"
  }
  Push-Location $frontend
  try { & npm.cmd run build:public | Select-Object -Last 3 }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Die "build failed with exit code $LASTEXITCODE" }
  Ok "build finished"
} else {
  Step 2 "Skipping build, using the build already on disk"
}

if ($BuildOnly) {
  Write-Host "`nBuild is ready and port 3000 is free." -ForegroundColor Green
  Write-Host "Start these three as blocking foreground commands so they stay visible and stoppable:" -ForegroundColor DarkGray
  Write-Host "  repo root  powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-backend.ps1 -Mode public" -ForegroundColor DarkGray
  Write-Host "  frontend/  npm.cmd run start:public" -ForegroundColor DarkGray
  Write-Host "  frontend/  npm.cmd run tunnel:public" -ForegroundColor DarkGray
  Write-Host "Then gate them with: deploy-public.ps1 -VerifyOnly`n" -ForegroundColor DarkGray
  exit 0
}

# ------------------------------------------------------------- 3. backend ----
Step 3 "Backend"
if (Get-Process -Name main -ErrorAction SilentlyContinue) {
  # Left running on purpose - stopping a backend that is already serving would
  # drop live requests. Note this cannot tell a release-mode backend from one
  # somebody started with a bare `go run main.go`; if in doubt, stop it and
  # re-run this script so it comes back up through start-backend.ps1.
  Ok "already running"
} else {
  New-Item -ItemType Directory -Force (Join-Path $logs "backend\current") | Out-Null
  $backendStamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backendOut = Join-Path $logs "backend\current\deploy-$backendStamp.out.log"
  $backendErr = Join-Path $logs "backend\current\deploy-$backendStamp.err.log"
  Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\start-backend.ps1"), "-Mode", "public" `
    -WorkingDirectory $root `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr `
    -WindowStyle Hidden | Out-Null

  # Prove it, the way step 4 proves the frontend. start-backend.ps1 compiles and
  # runs migrations before it serves, so this waits longer than a bare `go run`
  # would need. Deliberately NOT keyed on stderr being non-empty: Go's logger
  # writes its successful "backend listening" line to stderr, so a stderr check
  # would call a good start a failure (docs/wiki/gotchas/
  # windows-powershell-cloudflared-stderr.md). The port is the real signal; the
  # log is only read once the port has failed to open.
  $listening = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    if (Get-PortOwner 8080) { $listening = $true; break }
  }
  if (-not $listening) {
    $backendStartErr = (Get-Content $backendErr -Raw -ErrorAction SilentlyContinue)
    if ($backendStartErr -and $backendStartErr.Trim()) { Die "start-backend.ps1 reported:`n$backendStartErr" }
    Die "nothing is listening on port 8080 after 90s - see $backendErr"
  }
  Ok "started in release mode, port 8080 listening"
}

# ------------------------------------------------------------ 4. frontend ----
Step 4 "Starting the frontend, then reading the start log"
# A fresh log per run. The previous run's process can still hold a handle on the
# shared one, so truncating it fails - and a unique file also means what we read
# back is this start's output and nothing else.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$errLog = Join-Path $logs "frontend\current\deploy-$stamp.err.log"
$outLog = Join-Path $logs "frontend\current\deploy-$stamp.out.log"
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "start:public" `
  -WorkingDirectory $frontend `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 8
$startErr = (Get-Content $errLog -Raw -ErrorAction SilentlyContinue)
if ($startErr -and $startErr.Trim()) { Die "start-public.ps1 reported:`n$startErr" }
if (-not (Get-PortOwner 3000)) { Die "nothing is listening on port 3000" }
Ok "start log clean, port 3000 listening"

# -------------------------------------------------------------- 5. tunnel ----
Step 5 "Tunnel"
if (Get-Process -Name cloudflared -ErrorAction SilentlyContinue) {
  Ok "already running"
} else {
  New-Item -ItemType Directory -Force (Join-Path $logs "tunnel\current") | Out-Null
  Start-Process -FilePath "npm.cmd" -ArgumentList "run", "tunnel:public" `
    -WorkingDirectory $frontend `
    -RedirectStandardOutput (Join-Path $logs "tunnel\current\public.out.log") `
    -RedirectStandardError (Join-Path $logs "tunnel\current\public.err.log") `
    -WindowStyle Hidden | Out-Null
  Ok "started"
}

Test-PublicReady
