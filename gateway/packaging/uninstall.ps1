<#
.SYNOPSIS
    Removes the DijiPeople Integration Gateway from this machine.

.DESCRIPTION
    Stops and deregisters the Windows service and removes the program files.

    LOCAL DATA IS KEPT BY DEFAULT. The gateway's folder under ProgramData holds
    attendance records that were read from a terminal and may not have reached
    DijiPeople yet — during a network outage, for instance. Deleting them as part
    of an uninstall would destroy the customer's payroll evidence, and an
    uninstall is very often just the first half of an upgrade. Pass -RemoveData
    when you genuinely want the machine left clean.

    Check what is outstanding first:
        DijiPeople.Gateway.exe status

.PARAMETER RemoveData
    Also delete the local queue, sync history, credential and logs.

.PARAMETER InstallPath
    Where the gateway was installed. Defaults to Program Files.

.EXAMPLE
    ./uninstall.ps1
    ./uninstall.ps1 -RemoveData
#>

[CmdletBinding()]
param(
    [switch] $RemoveData,
    [string] $InstallPath = (Join-Path $env:ProgramFiles 'DijiPeople\Integration Gateway')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell window (right-click, Run as administrator).'
}

$exe      = Join-Path $InstallPath 'DijiPeople.Gateway.exe'
$dataPath = Join-Path $env:ProgramData 'DijiPeople\IntegrationGateway'

Write-Host 'DijiPeople Integration Gateway — removal' -ForegroundColor Cyan
Write-Host ''

# --- warn about anything that would be lost --------------------------------

if ((Test-Path $exe) -and -not $RemoveData) {
    Write-Host 'Current state:'
    & $exe status 2>$null
    Write-Host ''
}

if (Test-Path $exe) {
    Write-Host 'Stopping and deregistering the service…'
    & $exe uninstall
}
elseif (Get-Service -Name 'DijiPeopleIntegrationGateway' -ErrorAction SilentlyContinue) {
    # The executable is gone but the service registration survived.
    sc.exe stop   DijiPeopleIntegrationGateway | Out-Null
    sc.exe delete DijiPeopleIntegrationGateway | Out-Null
}

if (Test-Path $InstallPath) {
    Write-Host "Removing $InstallPath…"
    # Retried once: a service that has just stopped can hold its binary briefly.
    try {
        Remove-Item $InstallPath -Recurse -Force
    }
    catch {
        Start-Sleep -Seconds 3
        Remove-Item $InstallPath -Recurse -Force
    }
}

if ($RemoveData) {
    if (Test-Path $dataPath) {
        Write-Host "Removing local data at $dataPath…" -ForegroundColor Yellow
        Remove-Item $dataPath -Recurse -Force
    }
    Write-Host ''
    Write-Host 'Removed, including local attendance data and the stored credential.' -ForegroundColor Green
}
else {
    Write-Host ''
    Write-Host 'Removed.' -ForegroundColor Green
    Write-Host "Local data was kept at $dataPath."
    Write-Host 'Reinstalling on this machine will pick up anything that had not been uploaded.'
    Write-Host 'Delete that folder, or re-run with -RemoveData, once you are sure it is not needed.'
}

Write-Host ''
Write-Host 'Revoke this gateway in DijiPeople as well, under'
Write-Host 'Settings > Integrations > Attendance > Gateways, so its credential stops working.'
