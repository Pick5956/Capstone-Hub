param(
  [string]$BackendUrl = "http://localhost:8080"
)

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  Write-Error "cloudflared was not found. Install Cloudflare Tunnel CLI first."
  exit 1
}

Write-Host "Starting Cloudflare Tunnel for $BackendUrl"
Write-Host "Copy the https://*.trycloudflare.com URL into mobile/.env.local as EXPO_PUBLIC_API_URL."

$emptyConfig = Join-Path $env:TEMP "restaurant-hub-cloudflared-quick-empty.yml"
if (-not (Test-Path $emptyConfig)) {
  New-Item -ItemType File -Path $emptyConfig | Out-Null
}

& $cloudflared.Source --config $emptyConfig tunnel --url $BackendUrl
