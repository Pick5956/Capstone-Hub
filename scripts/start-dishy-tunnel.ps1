$ErrorActionPreference = "Stop"

$tunnelName = "restaurant-hub-api-dev"

$existingTunnel = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$tunnelName*" } |
  Select-Object -First 1
if ($existingTunnel) {
  throw "Cloudflare Tunnel '$tunnelName' is already running as PID $($existingTunnel.ProcessId)."
}

. (Join-Path $PSScriptRoot "runtime-logging.ps1")

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw "cloudflared is not available in PATH."
}

Write-Host "Starting Cloudflare Tunnel: $tunnelName"
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$token = (& cloudflared tunnel token $tunnelName 2>$null)
$tokenExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

$env:TUNNEL_TOKEN = $token
if ($tokenExitCode -ne 0 -or -not $env:TUNNEL_TOKEN) {
  throw "Cannot get Cloudflare Tunnel token for '$tunnelName'. Run 'cloudflared tunnel login' or check Cloudflare access."
}

$logs = New-RuntimeLogStream -Producer "tunnel" -RunName "public"
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

& cloudflared tunnel run 1>> $logs.Stdout 2>> $logs.Stderr
$exitCode = $LASTEXITCODE
$env:TUNNEL_TOKEN = $null

if ($exitCode -ne 0) {
  Write-Error "Cloudflare Tunnel exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
