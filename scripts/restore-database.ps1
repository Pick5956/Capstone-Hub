[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateNotNullOrEmpty()]
  [string]$BackupFile,

  [Parameter(Mandatory)]
  [ValidateNotNullOrEmpty()]
  [string]$ConfirmTarget,

  [switch]$ConfirmRestore
)

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

if (-not $ConfirmRestore.IsPresent) {
  throw "Restore is destructive. Pass -ConfirmRestore and the exact -ConfirmTarget value."
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

$expectedTarget = "{0}@{1}:{2}/{3}" -f $databaseUser, $databaseHost, $parsedPort, $databaseName
if (-not [string]::Equals($ConfirmTarget, $expectedTarget, [StringComparison]::Ordinal)) {
  throw "ConfirmTarget does not match the configured database."
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "backups"))
$resolvedBackup = [IO.Path]::GetFullPath($BackupFile)
$backupPrefix = $backupRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedBackup.StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "BackupFile must be inside the repository backups directory."
}
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) {
  throw "BackupFile does not exist."
}

$pgRestore = (Get-Command "pg_restore" -ErrorAction Stop).Source
& $pgRestore --list $resolvedBackup *> $null
if ($LASTEXITCODE -ne 0) {
  throw "BackupFile is not a valid pg_restore archive."
}

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

  Write-Host "Restoring $resolvedBackup into the confirmed database target."
  Write-Host "Keep the backend in maintenance/stopped state until this command finishes."
  & $pgRestore `
    --host=$databaseHost `
    --port=$parsedPort `
    --username=$databaseUser `
    --dbname=$databaseName `
    --no-password `
    --clean `
    --if-exists `
    --no-owner `
    --no-privileges `
    --single-transaction `
    --exit-on-error `
    $resolvedBackup
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore exited with code $LASTEXITCODE."
  }

  Write-Host "Database restore completed for the confirmed target."
} finally {
  Restore-ProcessEnvironment "PGPASSWORD" $previousPGPassword
  Restore-ProcessEnvironment "PGSSLMODE" $previousPGSSLMode
  Restore-ProcessEnvironment "PGSSLROOTCERT" $previousPGSSLRootCert
}
