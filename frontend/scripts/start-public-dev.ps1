$ErrorActionPreference = "Stop"

$frontendDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $frontendDir ".env.public.local"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $name, $value = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
  }
}

if (-not $env:NEXT_PUBLIC_API_URL) {
  $env:NEXT_PUBLIC_API_URL = "https://api.dishy.pro"
}

# Turbopack dev chunk names are stable across edits. A per-run deployment ID adds
# a fresh query token so Cloudflare/browser caches cannot reuse an older client bundle.
$env:NEXT_DEPLOYMENT_ID = "dev-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

Write-Host "Starting public frontend at https://dishy.pro"
Write-Host "API: $env:NEXT_PUBLIC_API_URL"

Set-Location $frontendDir
npx next dev --hostname 0.0.0.0
