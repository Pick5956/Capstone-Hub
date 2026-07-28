$ErrorActionPreference = "Stop"

$existingListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  throw "Frontend port 3000 is already in use by PID $($existingListener.OwningProcess)."
}

$frontendDir = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $frontendDir
. (Join-Path $projectRoot "scripts\runtime-logging.ps1")

$logs = New-RuntimeLogStream -Producer "frontend" -RunName "local"
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source

Write-Host "Starting local frontend at http://localhost:3000"
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

Set-Location $frontendDir
& $npx next dev --hostname 0.0.0.0 1>> $logs.Stdout 2>> $logs.Stderr
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Error "Frontend exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
