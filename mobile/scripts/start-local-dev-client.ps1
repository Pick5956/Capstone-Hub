$ErrorActionPreference = "Stop"

function Get-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }

  $prefix = "${Name}="
  $line = Get-Content -LiteralPath $Path -Encoding utf8 |
    Where-Object { $_.StartsWith($prefix, [System.StringComparison]::Ordinal) } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  return $line.Substring($prefix.Length).Trim().Trim('"').Trim("'")
}

function Test-PrivateIpv4([string]$Address) {
  $parts = $Address.Split(".")
  if ($parts.Count -ne 4) {
    return $false
  }

  $first = [int]$parts[0]
  $second = [int]$parts[1]
  return $first -eq 10 `
    -or ($first -eq 172 -and $second -ge 16 -and $second -le 31) `
    -or ($first -eq 192 -and $second -eq 168)
}

$networks = Get-NetIPConfiguration |
  Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway } |
  Sort-Object { $_.NetAdapter.InterfaceMetric }

$localAddress = $networks |
  ForEach-Object { $_.IPv4Address } |
  ForEach-Object { $_.IPAddress } |
  Where-Object { Test-PrivateIpv4 -Address $_ } |
  Select-Object -First 1

if (-not $localAddress) {
  throw "No active private LAN address was found for Expo."
}

$backendUrl = "http://${localAddress}:8080"
$backendReachable = $false
try {
  Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
  $backendReachable = $true
} catch {
  $backendReachable = $null -ne $_.Exception.Response
}

if (-not $backendReachable) {
  throw "The local backend is not reachable over LAN on port 8080."
}

$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repositoryRoot = (Resolve-Path (Join-Path $mobileRoot "..")).Path
$mobileGoogleClientId = Get-DotEnvValue `
  -Path (Join-Path $mobileRoot ".env.local") `
  -Name "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
$frontendGoogleClientId = Get-DotEnvValue `
  -Path (Join-Path $repositoryRoot "frontend\.env.local") `
  -Name "NEXT_PUBLIC_GOOGLE_CLIENT_ID"
$backendGoogleClientId = Get-DotEnvValue `
  -Path (Join-Path $repositoryRoot "backend\.env") `
  -Name "GOOGLE_CLIENT_ID"

if (
  $frontendGoogleClientId `
  -and $backendGoogleClientId `
  -and $frontendGoogleClientId -ne $backendGoogleClientId
) {
  throw "Frontend and backend Google OAuth audience configuration do not match."
}

$googleClientId = $mobileGoogleClientId
if (-not $googleClientId) {
  $googleClientId = $frontendGoogleClientId
}
if (-not $googleClientId) {
  $googleClientId = $backendGoogleClientId
}

if ($googleClientId) {
  if (-not $googleClientId.EndsWith(".apps.googleusercontent.com")) {
    throw "The local Google OAuth audience configuration is invalid."
  }
  if ($backendGoogleClientId -and $googleClientId -ne $backendGoogleClientId) {
    throw "The mobile Google OAuth audience must match the backend configuration."
  }

  $env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = $googleClientId
  Write-Host "Loaded the Google OAuth audience from ignored local configuration."
} else {
  Write-Warning "Google Login is disabled until a Web OAuth client ID is configured locally."
}

$env:EXPO_PUBLIC_API_URL = $backendUrl
Write-Host "Starting the Expo development client with the local backend on port 8080."

& npx.cmd expo start --dev-client --lan
exit $LASTEXITCODE
