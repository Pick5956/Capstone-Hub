$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$frontendScript = Join-Path $projectRoot "frontend\scripts\start-local-dev.ps1"
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source

function Get-PortListener([int]$Port) {
  Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Wait-ForPort([int]$Port, [System.Diagnostics.Process]$Launcher, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 300
    $listener = Get-PortListener -Port $Port
    if ($listener) {
      return $listener
    }
    $Launcher.Refresh()
  } until ($Launcher.HasExited -or (Get-Date) -ge $deadline)

  return $null
}

function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$frontendListener = Get-PortListener -Port 3000
$backendListener = Get-PortListener -Port 8080
if ($frontendListener -or $backendListener) {
  $active = @()
  if ($frontendListener) { $active += "3000 (PID $($frontendListener.OwningProcess))" }
  if ($backendListener) { $active += "8080 (PID $($backendListener.OwningProcess))" }
  throw "Local app is already running on: $($active -join ', ')."
}

$backendLauncher = Start-Process -FilePath $powershell -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $backendScript,
  "-Mode", "local"
) -WindowStyle Hidden -PassThru

$backendListener = Wait-ForPort -Port 8080 -Launcher $backendLauncher
if (-not $backendListener) {
  Stop-ProcessTree -ProcessId $backendLauncher.Id
  throw "Backend did not become ready. Check the newest *-backend-local.err.log in logs\backend\current."
}

$frontendLauncher = Start-Process -FilePath $powershell -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $frontendScript
) -WindowStyle Hidden -PassThru

$frontendListener = Wait-ForPort -Port 3000 -Launcher $frontendLauncher
if (-not $frontendListener) {
  Stop-ProcessTree -ProcessId $frontendLauncher.Id
  Stop-ProcessTree -ProcessId $backendLauncher.Id
  throw "Frontend did not become ready. Check the newest *-frontend-local.err.log in logs\frontend\current."
}

[PSCustomObject]@{
  FrontendUrl = "http://localhost:3000"
  FrontendPid = $frontendListener.OwningProcess
  BackendUrl = "http://localhost:8080"
  BackendPid = $backendListener.OwningProcess
  FrontendLogs = "logs\frontend\current"
  BackendLogs = "logs\backend\current"
} | Format-List
