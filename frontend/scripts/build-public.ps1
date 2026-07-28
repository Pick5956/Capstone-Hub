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

Write-Host "Building the low-memory public frontend"

Set-Location $frontendDir
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nextCli = Join-Path $frontendDir "node_modules\next\dist\bin\next"
& $node $nextCli build
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Error "Public frontend build exited with code $exitCode."
}

exit $exitCode
