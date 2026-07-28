[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-RequiredDatabaseEnvironment {
  param([Parameter(Mandatory)][string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name is required in the process environment."
  }
  return $value
}

function Restore-ProcessEnvironment {
  param(
    [Parameter(Mandatory)][string]$Name,
    [AllowNull()][string]$PreviousValue
  )

  if ($null -eq $PreviousValue) {
    Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
    return
  }
  [Environment]::SetEnvironmentVariable($Name, $PreviousValue, "Process")
}

$databaseHost = Get-RequiredDatabaseEnvironment "DB_HOST"
$databaseUser = Get-RequiredDatabaseEnvironment "DB_USER"
$databasePassword = Get-RequiredDatabaseEnvironment "DB_PASSWORD"
$databaseName = Get-RequiredDatabaseEnvironment "DB_NAME"
$databasePort = if ([string]::IsNullOrWhiteSpace($env:DB_PORT)) { "5432" } else { $env:DB_PORT }
$databaseSSLMode = if ([string]::IsNullOrWhiteSpace($env:DB_SSLMODE)) { "disable" } else { $env:DB_SSLMODE }

$parsedPort = 0
if (-not [int]::TryParse($databasePort, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
  throw "DB_PORT must be an integer between 1 and 65535."
}
if ($databaseSSLMode -notin @("disable", "allow", "prefer", "require", "verify-ca", "verify-full")) {
  throw "DB_SSLMODE is invalid."
}

$pgDump = (Get-Command "pg_dump" -ErrorAction Stop).Source
$pgRestore = (Get-Command "pg_restore" -ErrorAction Stop).Source
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $repositoryRoot "backups"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$backupPath = Join-Path $backupRoot (
  "restaurant-hub-{0}-{1}.dump" -f
  (Get-Date -Format "yyyyMMdd-HHmmssfff"),
  ([guid]::NewGuid().ToString("N").Substring(0, 8))
)

$previousPGPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
$previousPGSSLMode = [Environment]::GetEnvironmentVariable("PGSSLMODE", "Process")
$previousPGSSLRootCert = [Environment]::GetEnvironmentVariable("PGSSLROOTCERT", "Process")

try {
  [Environment]::SetEnvironmentVariable("PGPASSWORD", $databasePassword, "Process")
  [Environment]::SetEnvironmentVariable("PGSSLMODE", $databaseSSLMode, "Process")
  if ([string]::IsNullOrWhiteSpace($env:DB_SSLROOTCERT)) {
    Remove-Item -LiteralPath "Env:PGSSLROOTCERT" -ErrorAction SilentlyContinue
  } else {
    [Environment]::SetEnvironmentVariable("PGSSLROOTCERT", $env:DB_SSLROOTCERT, "Process")
  }

  & $pgDump `
    --host=$databaseHost `
    --port=$parsedPort `
    --username=$databaseUser `
    --dbname=$databaseName `
    --no-password `
    --format=custom `
    --no-owner `
    --no-privileges `
    --file=$backupPath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump exited with code $LASTEXITCODE."
  }

  & $pgRestore --list $backupPath *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore could not validate the new backup archive."
  }

  $backupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash
  Write-Host "Database backup created: $backupPath"
  Write-Host "SHA256: $backupHash"
} catch {
  if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
    Remove-Item -LiteralPath $backupPath -Force
  }
  throw
} finally {
  Restore-ProcessEnvironment "PGPASSWORD" $previousPGPassword
  Restore-ProcessEnvironment "PGSSLMODE" $previousPGSSLMode
  Restore-ProcessEnvironment "PGSSLROOTCERT" $previousPGSSLRootCert
}
