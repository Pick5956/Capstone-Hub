$ErrorActionPreference = "Stop"

$tunnelName = "restaurant-hub-api-dev"

$existingTunnel = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$tunnelName*" } |
  Select-Object -First 1
if ($existingTunnel) {
  throw "Cloudflare Tunnel '$tunnelName' is already running as PID $($existingTunnel.ProcessId)."
}

. (Join-Path $PSScriptRoot "runtime-logging.ps1")

$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
  throw "cloudflared is not available in PATH."
}

Write-Host "Starting Cloudflare Tunnel: $tunnelName"
$previousErrorActionPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = "Continue"
  $token = (& $cloudflaredCommand.Source tunnel token $tunnelName 2>$null)
  $tokenExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
}

$tokenText = ($token -join [Environment]::NewLine).Trim()
if ($tokenExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($tokenText)) {
  throw "Cannot get Cloudflare Tunnel token for '$tunnelName'. Run 'cloudflared tunnel login' or check Cloudflare access."
}

$env:TUNNEL_TOKEN = $tokenText
$logs = New-RuntimeLogStream -Producer "tunnel" -RunName "public"
Write-Host "Logs: $($logs.Stdout) and $($logs.Stderr)"

$tunnelStarted = $false
try {
  # Windows PowerShell 5 converts native stderr into ErrorRecord objects. Cloudflared
  # writes normal INFO lifecycle messages to stderr, so direct invocation under
  # ErrorActionPreference=Stop aborts on a healthy startup. ProcessStartInfo keeps
  # the native streams raw and also avoids Start-Process failing when a host exports
  # both Path and PATH environment keys.
  $stdoutStream = [System.IO.File]::Open(
    $logs.Stdout,
    [System.IO.FileMode]::Append,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::ReadWrite
  )
  $stderrStream = [System.IO.File]::Open(
    $logs.Stderr,
    [System.IO.FileMode]::Append,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::ReadWrite
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $cloudflaredCommand.Source
  $startInfo.Arguments = "tunnel run"
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $tunnelProcess = New-Object System.Diagnostics.Process
  $tunnelProcess.StartInfo = $startInfo
  if (-not $tunnelProcess.Start()) {
    throw "Cloudflare Tunnel process could not be started."
  }
  $tunnelStarted = $true

  $stdoutCopy = $tunnelProcess.StandardOutput.BaseStream.CopyToAsync($stdoutStream)
  $stderrCopy = $tunnelProcess.StandardError.BaseStream.CopyToAsync($stderrStream)
  $tunnelProcess.WaitForExit()
  $stdoutCopy.GetAwaiter().GetResult() | Out-Null
  $stderrCopy.GetAwaiter().GetResult() | Out-Null
  $exitCode = $tunnelProcess.ExitCode
} finally {
  if ($tunnelProcess) {
    if ($tunnelStarted -and -not $tunnelProcess.HasExited) {
      try {
        $tunnelProcess.Kill()
        $tunnelProcess.WaitForExit()
      } catch {
        # Preserve the original interruption/error while still attempting cleanup.
      }
    }
    $tunnelProcess.Dispose()
  }
  if ($stdoutStream) {
    $stdoutStream.Dispose()
  }
  if ($stderrStream) {
    $stderrStream.Dispose()
  }
  Remove-Item Env:TUNNEL_TOKEN -ErrorAction SilentlyContinue
}

if ($exitCode -ne 0) {
  Write-Error "Cloudflare Tunnel exited with code $exitCode. Check $($logs.Stderr)."
}

exit $exitCode
