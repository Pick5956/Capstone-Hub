$ErrorActionPreference = "Stop"

$frontendDir = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $frontendDir
$envFile = Join-Path $frontendDir ".env.public.local"

$existingListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  throw "Frontend port 3000 is already in use by PID $($existingListener.OwningProcess)."
}

. (Join-Path $projectRoot "scripts\runtime-logging.ps1")
$logs = New-RuntimeLogStream -Producer "frontend" -RunName "public"

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
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

Set-Location $frontendDir
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nextCli = Join-Path $frontendDir "node_modules\next\dist\bin\next"
& $node $nextCli dev --hostname 0.0.0.0 1>> $logs.Stdout 2>> $logs.Stderr
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Error "Public frontend exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
