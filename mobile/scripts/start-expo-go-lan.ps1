param(
  [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

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

$existingListener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($existingListener) {
  Write-Host "Expo is already listening on port $Port (PID $($existingListener.OwningProcess))."
  exit 0
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
try {
  Invoke-WebRequest -Uri "$backendUrl/readyz" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
  throw "The local backend is not ready at $backendUrl."
}

$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repositoryRoot = (Resolve-Path (Join-Path $mobileRoot "..")).Path
$logDirectory = Join-Path $repositoryRoot "logs\mobile\expo"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$stdoutLog = Join-Path $logDirectory "$stamp-expo-go-lan.out.log"
$stderrLog = Join-Path $logDirectory "$stamp-expo-go-lan.err.log"

$env:EXPO_PUBLIC_API_URL = $backendUrl
$env:EXPO_NO_REDIRECT_PAGE = "1"

Write-Host "Starting Expo Go at exp://${localAddress}:$Port"
Write-Host "Logs: $stdoutLog and $stderrLog"

Push-Location $mobileRoot
try {
  & npx.cmd expo start --go --lan --port $Port 1> $stdoutLog 2> $stderrLog
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
