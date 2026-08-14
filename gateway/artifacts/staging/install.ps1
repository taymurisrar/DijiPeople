<#
.SYNOPSIS
    Installs the DijiPeople Integration Gateway on this machine.

.DESCRIPTION
    Run this from the folder you unpacked, in an ELEVATED PowerShell window.

    It copies the gateway into Program Files, registers it as a Windows service
    that starts automatically at boot, pairs it with DijiPeople, and starts it.
    After that the gateway runs unattended: no logged-in user, no open window,
    no scheduled task.

    Nothing else is installed. The gateway is self-contained, so this machine
    needs no .NET runtime, no Node.js, no npm, no Git and no DijiPeople source.

.PARAMETER Url
    Your DijiPeople API address, for example https://api.yourcompany.com

.PARAMETER PairingCode
    The single-use code from DijiPeople, under
    Settings > Integrations > Attendance > Gateways. Optional here; you can pair
    afterwards with `DijiPeople.Gateway.exe pair --code ...`.

.PARAMETER InstallPath
    Where to install. Defaults to Program Files.

.EXAMPLE
    ./install.ps1 -Url https://api.yourcompany.com -PairingCode ABCD-EFGH
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Url,

    [string] $PairingCode,

    [string] $InstallPath = (Join-Path $env:ProgramFiles 'DijiPeople\Integration Gateway')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- elevation -------------------------------------------------------------
#
# Required to register a service and to write to Program Files. The RUNNING
# service does not need an interactive administrator; this is a one-time
# installation privilege.

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell window (right-click, Run as administrator).'
}

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe    = Join-Path $InstallPath 'DijiPeople.Gateway.exe'

if (-not (Test-Path (Join-Path $source 'DijiPeople.Gateway.exe'))) {
    throw "DijiPeople.Gateway.exe was not found in $source. Run this script from the unpacked package folder."
}

Write-Host 'DijiPeople Integration Gateway — installation' -ForegroundColor Cyan
Write-Host ''

# --- stop anything already running -----------------------------------------
#
# An upgrade over a running service would fail on a locked binary. Stopping
# first is safe: queued attendance lives in ProgramData, not here, so nothing is
# lost by replacing the program files underneath it.

if (Get-Service -Name 'DijiPeopleIntegrationGateway' -ErrorAction SilentlyContinue) {
    Write-Host 'Stopping the existing service…'
    & $exe stop 2>$null | Out-Null
    Start-Sleep -Seconds 2
}

# --- copy ------------------------------------------------------------------

Write-Host "Installing to $InstallPath…"
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

Copy-Item -Path (Join-Path $source '*') -Destination $InstallPath -Recurse -Force `
    -Exclude 'install.ps1', 'uninstall.ps1'

# --- configure -------------------------------------------------------------

Write-Host 'Configuring…'
& $exe configure --url $Url
if ($LASTEXITCODE -ne 0) { throw 'Configuration failed.' }

# --- register the service --------------------------------------------------

Write-Host 'Registering the Windows service…'
& $exe install
if ($LASTEXITCODE -ne 0) { throw 'The service could not be registered.' }

# --- pair ------------------------------------------------------------------

if ($PairingCode) {
    Write-Host 'Pairing with DijiPeople…'
    & $exe pair --code $PairingCode --force
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Pairing did not complete. Generate a new code in DijiPeople and run:'
        Write-Warning "  `"$exe`" pair --code <PAIRING-CODE>"
    }
}
else {
    Write-Host ''
    Write-Host 'No pairing code was supplied. Pair this gateway with:' -ForegroundColor Yellow
    Write-Host "  `"$exe`" pair --code <PAIRING-CODE>"
}

# --- start -----------------------------------------------------------------

Write-Host 'Starting the service…'
& $exe start | Out-Null

Write-Host ''
Write-Host 'Installed.' -ForegroundColor Green
Write-Host ''
& $exe status
Write-Host ''
Write-Host 'The gateway now runs in the background and restarts with Windows.'
Write-Host 'Useful commands:'
Write-Host "  `"$exe`" status"
Write-Host "  `"$exe`" diagnostics"
