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

if ($Mode -eq "public") {
  $env:PUBLIC_BACKEND_URL = "https://api.dishy.pro"

  # DISHY-03: serve the public backend in Gin *release* mode, not debug. That
  # collapses CORS to the configured allow-list (no debug dev-origin wildcard).
  #
  # Release skips backend/.env, so opt back in with LOAD_DOTENV and let godotenv
  # - the same parser local dev uses - do the reading. This script used to parse
  # the file itself, splitting each line on the first `=`. It was wrong in two
  # ways that only ever broke the public run:
  #   * lines with no `=` were skipped, and those are the body of the multi-line
  #     quoted GROQ_API_KEYS / GEMINI_API_KEYS blocks, so each key list arrived
  #     as nothing but its opening quote and every AI call came back 401;
  #   * inline `# ...` comments were kept, so GROQ_MODEL and GEMINI_MODEL carried
  #     their notes into the model name and Gemini answered 404 "model no longer
  #     exists".
  # Do not reintroduce a hand-rolled parser here.
  $env:LOAD_DOTENV = "1"
  $env:GIN_MODE = "release"
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
