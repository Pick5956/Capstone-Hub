param(
  [ValidateSet("local", "public")]
  [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"

$existingListener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  throw "Backend port 8080 is already in use by PID $($existingListener.OwningProcess)."
}

. (Join-Path $PSScriptRoot "runtime-logging.ps1")

$backendDir = Join-Path (Split-Path -Parent $PSScriptRoot) "backend"
$logs = New-RuntimeLogStream -Producer "backend" -RunName $Mode
$go = (Get-Command go -ErrorAction Stop).Source

if ($Mode -eq "public") {
  $env:PUBLIC_BACKEND_URL = "https://api.dishy.pro"
}

Write-Host "Starting backend from source at http://localhost:8080"
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

Set-Location $backendDir
& $go run main.go 1>> $logs.Stdout 2>> $logs.Stderr
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Error "Backend exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
