$ErrorActionPreference = "Stop"

$tunnelName = "restaurant-hub-api-dev"

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

& cloudflared tunnel run
