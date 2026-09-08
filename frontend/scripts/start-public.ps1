$ErrorActionPreference = "Stop"

$frontendDir = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $frontendDir
$envFile = Join-Path $frontendDir ".env.public.local"
$buildId = Join-Path $frontendDir ".next\BUILD_ID"

$existingListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  throw "Frontend port 3000 is already in use by PID $($existingListener.OwningProcess)."
}

if (-not (Test-Path $buildId)) {
  throw "Public frontend build is missing. Run npm.cmd run build:public first."
}

. (Join-Path $projectRoot "scripts\runtime-logging.ps1")
$logs = New-RuntimeLogStream -Producer "frontend" -RunName "public-production"

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

Write-Host "Starting low-memory public frontend at https://dishy.pro"
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

Set-Location $frontendDir
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nextCli = Join-Path $frontendDir "node_modules\next\dist\bin\next"
# Deliberately not `& $node ... 1>> out 2>> err`. Under
# $ErrorActionPreference = "Stop" PowerShell 5.1 turns every stderr line from a
# native program into a terminating NativeCommandError, so one routine Next
# message - an internal NoFallbackError while correctly answering a 404 - killed
# this script and took the public site down with it.
# Invoke-LoggedNativeProcess (scripts/runtime-logging.ps1) captures both streams
# without PowerShell interpreting either as an error.
$exitCode = Invoke-LoggedNativeProcess `
  -FilePath $node `
  -Arguments "`"$nextCli`" start --hostname 0.0.0.0" `
  -StdoutPath $logs.Stdout `
  -StderrPath $logs.Stderr

if ($exitCode -ne 0) {
  Write-Error "Public frontend exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
