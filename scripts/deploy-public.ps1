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
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-public.ps1
#   -SkipBuild   restart on the build already on disk
#   -Clean       delete .next first (only when the build is actually suspect;
#                a clean build changes every asset hash, which breaks any tab
#                that is already open)

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 still negotiates TLS 1.0 by default, which Cloudflare
# refuses - without this every readiness probe throws and reports 0.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontend = Join-Path $root "frontend"
$logs = Join-Path $root "logs"

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

# ------------------------------------------------------------- 3. backend ----
Step 3 "Backend"
if (Get-Process -Name main -ErrorAction SilentlyContinue) {
  Ok "already running"
} else {
  New-Item -ItemType Directory -Force (Join-Path $logs "backend\current") | Out-Null
  Start-Process -FilePath "go" -ArgumentList "run", "main.go" `
    -WorkingDirectory (Join-Path $root "backend") `
    -RedirectStandardOutput (Join-Path $logs "backend\current\public.out.log") `
    -RedirectStandardError (Join-Path $logs "backend\current\public.err.log") `
    -WindowStyle Hidden | Out-Null
  Ok "started"
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

# --------------------------------------------------------------- 6. ready ----
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

# ------------------------------------------------------------- 7. assets -----
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

# ---------------------------------------------------------------- 8. pids ----
Step 8 "Real process ids"
$fePid = Get-PortOwner 3000
Get-Process main, cloudflared -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host ("    {0,-14} {1}" -f $_.ProcessName, $_.Id) }
Write-Host ("    {0,-14} {1}" -f "frontend node", $fePid)

Write-Host "`nhttps://dishy.pro is live and verified.`n" -ForegroundColor Green
Write-Host "Stop with:" -ForegroundColor DarkGray
Write-Host "  Get-Process main,cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force; Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force }" -ForegroundColor DarkGray
