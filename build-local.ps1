# Build the canonical platform with native Windows tooling. Does not start/stop services.
[CmdletBinding()]
param([ValidateSet(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)][int[]]$Phase = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))

$ErrorActionPreference = 'Stop'
$platformRoot = Join-Path $PSScriptRoot 'platform'
$runtimeRoot = Join-Path $platformRoot '.run'
$nodeDirectory = 'C:\ORGANISED\xelor-local\node22'
$nodePath = Join-Path $nodeDirectory 'node.exe'
$selectedPhases = @($Phase | Sort-Object -Unique)
$savedEnvironment = @{}
foreach ($name in @('PATH', 'NODE_ENV', 'PRODUCT_PHASE', 'NEXT_PUBLIC_PRODUCT_PHASE',
        'NEXT_PUBLIC_API_ORIGIN', 'NEXT_BUILD_DIR')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function Assert-WebOutputIsIdle([int[]]$Numbers) {
    $listeners = @(& netstat.exe -ano -p TCP)
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -OperationTimeoutSec 15)
    foreach ($number in $Numbers) {
        $webPort = 3901 + $number * 100
        if ($listeners | Where-Object { $_ -match ('^\s*TCP\s+\S+:' + $webPort + '\s+\S+\s+LISTENING\s+\d+\s*$') }) {
            throw "Phase $number web port $webPort is in use. Stop that profile before rebuilding; no process was stopped."
        }
        # Also catch launchers that have not bound their port yet. This conservative
        # check rejects selected phase launchers even when their working directory is unknown.
        $active = @($processes | Where-Object {
            [string]$_.CommandLine -match ('phase\.mjs["'']?\s+' + $number + '\s+(?:start|dev)(?:\s|$)') -or
            [string]$_.CommandLine -match ('(?:--port|-p)(?:\s+|=)' + $webPort + '(?:\s|$)')
        })
        if ($active.Count -gt 0) {
            throw "Phase $number has an active web/phase process (PID $($active.ProcessId -join ', ')). Stop it before rebuilding; no process was stopped."
        }
    }
}

function Invoke-PackageBuild([string]$Package) {
    & $pnpmPath --filter $Package build
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $Package (exit $LASTEXITCODE). Remaining builds were not run." }
}

$lock = $null
$locationPushed = $false
try {
    if (-not (Test-Path -LiteralPath $nodePath)) { throw "Portable Node 22 is missing: $nodePath" }
    foreach ($required in @('package.json', 'node_modules', '.env')) {
        if (-not (Test-Path -LiteralPath (Join-Path $platformRoot $required))) {
            throw "Complete platform setup before building: $required is missing."
        }
    }
    $env:PATH = $nodeDirectory + ';' + $savedEnvironment['PATH']
    # Calling the installed Windows command from PowerShell avoids phase.mjs's bare spawn.
    $pnpmPath = (Get-Command pnpm.cmd -CommandType Application -ErrorAction Stop).Source
    $env:NODE_ENV = 'production'
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    try {
        $lock = [System.IO.File]::Open((Join-Path $runtimeRoot 'windows-launch.lock'),
            [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch { throw 'Another local build/start/stop operation is already running.' }

    Assert-WebOutputIsIdle $selectedPhases
    Push-Location -LiteralPath $platformRoot
    $locationPushed = $true
    foreach ($package in @('@ind-core/platform', '@ind-core/db', '@ind-core/api')) {
        Invoke-PackageBuild $package
    }
    foreach ($number in $selectedPhases) {
        # Repeat immediately before each output is overwritten in case another terminal
        # used an upstream launcher that does not participate in the Windows lock.
        Assert-WebOutputIsIdle @($number)
        $env:PRODUCT_PHASE = [string]$number
        $env:NEXT_PUBLIC_PRODUCT_PHASE = [string]$number
        $env:NEXT_PUBLIC_API_ORIGIN = 'http://127.0.0.1:' + (3900 + $number * 100)
        $env:NEXT_BUILD_DIR = ".next/phase-$number"
        Write-Host "Building phase $number into $($env:NEXT_BUILD_DIR)."
        Invoke-PackageBuild '@ind-core/web'
    }
    Write-Host "Built selected phase(s): $($selectedPhases -join ', '). Use start-local.ps1 to launch them."
} finally {
    if ($locationPushed) { Pop-Location }
    if ($null -ne $lock) { $lock.Dispose() }
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
}
