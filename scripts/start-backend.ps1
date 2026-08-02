param(
  [ValidateSet("local", "public")]
  [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"

$existingListener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  throw "Backend port 8080 is already in use by PID $($existingListener.OwningProcess)."
}

. (Join-Path $PSScriptRoot "runtime-logging.ps1")

$backendDir = Join-Path (Split-Path -Parent $PSScriptRoot) "backend"
$logs = New-RuntimeLogStream -Producer "backend" -RunName $Mode
$go = (Get-Command go -ErrorAction Stop).Source

function Invoke-LoggedNativeProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string]$Arguments,

    [Parameter(Mandatory = $true)]
    [string]$StdoutPath,

    [Parameter(Mandatory = $true)]
    [string]$StderrPath
  )

  $stdoutStream = $null
  $stderrStream = $null
  $process = $null
  try {
    $stdoutStream = [System.IO.File]::Open(
      $StdoutPath,
      [System.IO.FileMode]::Append,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::ReadWrite
    )
    $stderrStream = [System.IO.File]::Open(
      $StderrPath,
      [System.IO.FileMode]::Append,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::ReadWrite
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.WorkingDirectory = $backendDir

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
      throw "Backend process could not be started."
    }

    $stdoutCopy = $process.StandardOutput.BaseStream.CopyToAsync($stdoutStream)
    $stderrCopy = $process.StandardError.BaseStream.CopyToAsync($stderrStream)
    $process.WaitForExit()
    $stdoutCopy.GetAwaiter().GetResult() | Out-Null
    $stderrCopy.GetAwaiter().GetResult() | Out-Null
    return $process.ExitCode
  } finally {
    if ($process) {
      if (-not $process.HasExited) {
        try {
          $process.Kill()
          $process.WaitForExit()
        } catch {
          # Preserve the original interruption/error while still attempting cleanup.
        }
      }
      $process.Dispose()
    }
    if ($stdoutStream) {
      $stdoutStream.Dispose()
    }
    if ($stderrStream) {
      $stderrStream.Dispose()
    }
  }
}

if ($Mode -eq "public") {
  $env:PUBLIC_BACKEND_URL = "https://api.dishy.pro"
}

Write-Host "Starting backend from source at http://localhost:8080"
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

Set-Location $backendDir
$migrationExitCode = Invoke-LoggedNativeProcess `
  -FilePath $go `
  -Arguments "run ./cmd/migrate" `
  -StdoutPath $logs.Stdout `
  -StderrPath $logs.Stderr
if ($migrationExitCode -ne 0) {
  Write-Error "Backend migrations exited with code $migrationExitCode. Check $($logs.Stderr)."
  exit $migrationExitCode
}

$exitCode = Invoke-LoggedNativeProcess `
  -FilePath $go `
  -Arguments "run main.go" `
  -StdoutPath $logs.Stdout `
  -StderrPath $logs.Stderr

if ($exitCode -ne 0) {
  Write-Error "Backend exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
