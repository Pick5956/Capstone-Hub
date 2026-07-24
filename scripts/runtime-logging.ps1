$RuntimeLoggingProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function New-RuntimeLogStream {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("backend", "frontend", "tunnel")]
    [string]$Producer,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-z0-9-]+$")]
    [string]$RunName
  )

  $logsRoot = Join-Path $RuntimeLoggingProjectRoot "logs"
  $currentDir = Join-Path $logsRoot "$Producer\current"

  New-Item -ItemType Directory -Force -Path $currentDir | Out-Null

  $resolvedLogsRoot = (Resolve-Path $logsRoot).Path.TrimEnd("\")
  $resolvedCurrentDir = (Resolve-Path $currentDir).Path
  $logsPrefix = "$resolvedLogsRoot\"

  if (-not $resolvedCurrentDir.StartsWith($logsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Runtime log path escaped the project logs directory."
  }

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $stdoutPath = Join-Path $resolvedCurrentDir "$timestamp-$Producer-$RunName.out.log"
  $stderrPath = Join-Path $resolvedCurrentDir "$timestamp-$Producer-$RunName.err.log"
  New-Item -ItemType File -Force -Path $stdoutPath, $stderrPath | Out-Null

  [PSCustomObject]@{
    Stdout = $stdoutPath
    Stderr = $stderrPath
  }
}
