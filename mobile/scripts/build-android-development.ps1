param(
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$previousNoVcs = [Environment]::GetEnvironmentVariable("EAS_NO_VCS", "Process")
$previousProjectRoot = [Environment]::GetEnvironmentVariable("EAS_PROJECT_ROOT", "Process")

$env:EAS_NO_VCS = "1"
$env:EAS_PROJECT_ROOT = $projectRoot

$arguments = @(
  "--yes",
  "eas-cli@latest",
  "build",
  "--platform",
  "android",
  "--profile",
  "development"
)
if ($NoWait) {
  $arguments += "--no-wait"
}

try {
  & npx.cmd @arguments
  exit $LASTEXITCODE
} finally {
  if ($null -eq $previousNoVcs) {
    Remove-Item Env:EAS_NO_VCS -ErrorAction SilentlyContinue
  } else {
    $env:EAS_NO_VCS = $previousNoVcs
  }

  if ($null -eq $previousProjectRoot) {
    Remove-Item Env:EAS_PROJECT_ROOT -ErrorAction SilentlyContinue
  } else {
    $env:EAS_PROJECT_ROOT = $previousProjectRoot
  }
}
