# Stop only Node process trees recorded by this checkout's start-local.ps1.
# PostgreSQL is shared with other local applications and remains running.
[CmdletBinding()]
param([ValidateSet(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)][int[]]$Phase = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))

$ErrorActionPreference = 'Stop'
$platformRoot = Join-Path $PSScriptRoot 'platform'
$runtimeRoot = Join-Path $platformRoot '.run'
$nodePath = 'C:\ORGANISED\xelor-local\node22\node.exe'
$launcherPath = Join-Path $platformRoot 'scripts\phase.mjs'

function Get-ProcessIdentity($Process) {
    [pscustomobject]@{
        id = [int]$Process.ProcessId
        created = $Process.CreationDate.ToUniversalTime().ToString('o')
        executable = [string]$Process.ExecutablePath
        command = [string]$Process.CommandLine
    }
}

function Test-Identity($Process, $Identity) {
    $null -ne $Process -and
        [int]$Process.ProcessId -eq [int]$Identity.id -and
        $Process.CreationDate.ToUniversalTime().ToString('o') -eq $Identity.created -and
        [string]$Process.ExecutablePath -ieq $nodePath -and
        [string]$Process.CommandLine -ceq [string]$Identity.command
}

function Get-OwnedTree($State, $Snapshot) {
    $owned = @{}
    foreach ($identity in @($State.owner) + @($State.members)) {
        if ($null -eq $identity) { continue }
        $live = $Snapshot | Where-Object { [int]$_.ProcessId -eq [int]$identity.id } | Select-Object -First 1
        if (Test-Identity $live $identity) { $owned[[int]$live.ProcessId] = $live }
    }
    do {
        $added = $false
        foreach ($candidate in $Snapshot) {
            $parent = $owned[[int]$candidate.ParentProcessId]
            if ($null -ne $parent -and -not $owned.ContainsKey([int]$candidate.ProcessId) -and
                [string]$candidate.ExecutablePath -ieq $nodePath -and
                $candidate.CreationDate -ge $parent.CreationDate) {
                $owned[[int]$candidate.ProcessId] = $candidate
                $added = $true
            }
        }
    } while ($added)
    @($owned.Values)
}

if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    Write-Host 'No recorded local application processes.'
    return
}
$lock = $null
try {
    try {
        $lock = [System.IO.File]::Open((Join-Path $runtimeRoot 'windows-launch.lock'),
            [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch { throw 'Another start-local.ps1 or stop-local.ps1 operation is already running.' }
    foreach ($number in @($Phase | Sort-Object -Unique)) {
        $statePath = Join-Path $runtimeRoot "windows-phase-$number.json"
        if (-not (Test-Path -LiteralPath $statePath)) {
            Write-Host "Phase $number has no Windows launcher ownership record."
            continue
        }
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($state.version -ne 1 -or [int]$state.phase -ne $number -or
            [string]$state.platform -ine $platformRoot -or
            [string]$state.owner.executable -ine $nodePath -or
            [string]$state.owner.command -notlike ('*' + $launcherPath + '*') -or
            [string]$state.owner.command -notmatch ('\s' + $number + '\s+start(?:\s|$)')) {
            throw "Unrecognized ownership record; no process will be stopped: $statePath"
        }
        $snapshot = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -OperationTimeoutSec 15)
        $owned = @(Get-OwnedTree $state $snapshot)
        # Persist the complete tree before terminating the parent. Windows SIGTERM
        # does not run Node's signal handlers, so its actual Next child needs its own stop.
        $state.members = @($owned | ForEach-Object { Get-ProcessIdentity $_ })
        $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8
        $targets = @($state.members | Sort-Object { if ([int]$_.id -eq [int]$state.owner.id) { 0 } else { 1 } })
        foreach ($identity in $targets) {
            $live = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$identity.id)" -OperationTimeoutSec 15
            if (-not (Test-Identity $live $identity)) { continue }
            $process = Get-Process -Id ([int]$identity.id) -ErrorAction SilentlyContinue
            if ($null -eq $process) { continue }
            # Holding this Process object obtains the OS handle before the stop, which
            # further narrows the PID-reuse window after the command-line identity check.
            $null = $process.Handle
            Stop-Process -InputObject $process -Force -ErrorAction Stop
        }
        $snapshot = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -OperationTimeoutSec 15)
        $remaining = @(Get-OwnedTree $state $snapshot)
        if ($remaining.Count -gt 0) { throw "Phase $number still has recorded processes; its ownership file was kept. Run stop-local.ps1 again." }
        Remove-Item -LiteralPath $statePath
        $phasePidFile = Join-Path $runtimeRoot "phase-$number\processes.json"
        if (Test-Path -LiteralPath $phasePidFile) { Remove-Item -LiteralPath $phasePidFile }
        Write-Host "Phase $number stopped (owned Node processes only)."
    }
    Write-Host 'PostgreSQL remains running. All databases and application logs were preserved.'
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
}
