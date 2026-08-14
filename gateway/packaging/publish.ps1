<#
.SYNOPSIS
    Builds the customer-installable DijiPeople Integration Gateway package.

.DESCRIPTION
    Produces one zip a customer machine can unpack and run, containing:

      DijiPeople.Gateway.exe            the host and the administration CLI
      workers\zkteco\...Worker.exe      the x86 ZKTeco worker
      install.ps1 / uninstall.ps1       one-command setup and removal
      README.txt                        the operator's instructions

    Both executables are published self-contained, so the customer machine needs
    no .NET runtime, no Node.js, no npm, no Git, no Visual Studio and no
    DijiPeople source code. The two are published for DIFFERENT architectures on
    purpose: the host is x64 and the ZKTeco worker is x86, because zkemkeeper is
    registered only as a 32-bit COM component. Isolating that in one child
    process is what keeps the rest of the gateway — and every future connector —
    off a 32-bit runtime.

    Nothing tenant-specific is baked in. The same package works for every
    customer; pairing is what connects an installation to one organisation.

.PARAMETER Version
    Overrides the version stamped into the package name and metadata.

.PARAMETER Configuration
    Build configuration. Release unless you are diagnosing the build itself.

.EXAMPLE
    pwsh ./publish.ps1
    pwsh ./publish.ps1 -Version 2.0.1
#>

[CmdletBinding()]
param(
    [string] $Version,
    [string] $Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$packagingRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$gatewayRoot   = Split-Path -Parent $packagingRoot
$repoRoot      = Split-Path -Parent $gatewayRoot

$hostProject   = Join-Path $gatewayRoot 'src/DijiPeople.Gateway.Host/DijiPeople.Gateway.Host.csproj'
$workerProject = Join-Path $repoRoot 'tools/zkteco-poc/worker/DijiPeople.ZkTeco.Worker.csproj'

$staging = Join-Path $gatewayRoot 'artifacts/staging'
$dist    = Join-Path $gatewayRoot 'artifacts/dist'

if (-not (Test-Path $workerProject)) {
    throw "The ZKTeco worker project was not found at $workerProject. The gateway package must ship the proven worker, not a reimplementation of it."
}

Write-Host 'DijiPeople Integration Gateway — packaging' -ForegroundColor Cyan
Write-Host ''

# --- clean -----------------------------------------------------------------

foreach ($path in @($staging, $dist)) {
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

# --- host (x64, self-contained) --------------------------------------------

Write-Host 'Publishing the gateway host (win-x64, self-contained)…'
dotnet publish $hostProject `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -o $staging `
    /p:DebugType=None `
    /p:GenerateDocumentationFile=false
if ($LASTEXITCODE -ne 0) { throw 'The gateway host failed to publish.' }

# --- ZKTeco worker (x86, self-contained) -----------------------------------
#
# Not a copy of a previously built binary: it is rebuilt here so the package can
# never ship a worker that has drifted from the source in this repository.

Write-Host 'Publishing the ZKTeco legacy worker (win-x86, self-contained)…'
$workerOutput = Join-Path $staging 'workers/zkteco'
New-Item -ItemType Directory -Path $workerOutput -Force | Out-Null

dotnet publish $workerProject `
    -c $Configuration `
    -r win-x86 `
    --self-contained true `
    -o $workerOutput
if ($LASTEXITCODE -ne 0) { throw 'The ZKTeco worker failed to publish.' }

# Debug symbols are not needed to run and roughly double the package size.
Get-ChildItem -Path $staging -Recurse -Include '*.pdb' | Remove-Item -Force

# --- operator files --------------------------------------------------------

Copy-Item (Join-Path $packagingRoot 'install.ps1')   $staging
Copy-Item (Join-Path $packagingRoot 'uninstall.ps1') $staging
Copy-Item (Join-Path $packagingRoot 'README.txt')    $staging

# --- verify the package is actually self-contained --------------------------
#
# A package that quietly needs a .NET runtime would install fine on a developer
# machine and fail on the customer's, which is the worst place to discover it.

$hostExe   = Join-Path $staging 'DijiPeople.Gateway.exe'
$workerExe = Join-Path $workerOutput 'DijiPeople.ZkTeco.Worker.exe'

foreach ($required in @($hostExe, $workerExe)) {
    if (-not (Test-Path $required)) { throw "The package is missing $required." }
}

if (-not (Test-Path (Join-Path $staging 'hostfxr.dll'))) {
    throw 'The gateway host does not look self-contained: hostfxr.dll is missing from the output.'
}

if (-not $Version) {
    $Version = (& $hostExe version).Split(' ')[0]
}

Write-Host ''
Write-Host "Package version: $Version"

# --- archive ---------------------------------------------------------------

$packageName = "DijiPeople.IntegrationGateway-$Version-win-x64.zip"
$packagePath = Join-Path $dist $packageName

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $packagePath -Force

$hash = (Get-FileHash -Path $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item $packagePath).Length

# --- release metadata ------------------------------------------------------
#
# Feeds `POST /app-releases` so the artefact is registered through the existing
# Apps & Downloads architecture. No storage URL is written here: the release
# points at a storage key that StorageService resolves, so the binary is served
# through the permission-checked download route rather than a public link.

$metadata = [ordered]@{
    appKey         = 'INTEGRATION_GATEWAY'
    name           = 'DijiPeople Integration Gateway'
    description    = 'Collects attendance from devices on your network and synchronises it with DijiPeople.'
    version        = $Version
    platform       = 'WINDOWS'
    architecture   = 'X64'
    # BETA until the acceptance tests in the phase plan have passed against real
    # hardware. Publishing STABLE before that would put an unvalidated build in
    # front of every tenant administrator.
    channel        = 'BETA'
    fileName       = $packageName
    fileSizeBytes  = $size
    checksumSha256 = $hash
    requiredPermission = 'gateways.manage'
}

$metadataPath = Join-Path $dist 'release-metadata.json'
$metadata | ConvertTo-Json -Depth 4 | Set-Content -Path $metadataPath -Encoding utf8

Write-Host ''
Write-Host 'Package built.' -ForegroundColor Green
Write-Host "  File      $packagePath"
Write-Host "  Size      $([math]::Round($size / 1MB, 1)) MB"
Write-Host "  SHA-256   $hash"
Write-Host "  Metadata  $metadataPath"
Write-Host ''
Write-Host 'Next: upload the zip to DijiPeople storage, then register it with'
Write-Host '  POST /app-releases   (permission: appDownloads.manage)'
Write-Host 'using the metadata above plus the returned storageKey.'
