# Native Windows launcher for XELOR, ONYX, AIKYANTRA and the integrated profile. Never resets data.
[CmdletBinding()]
param(
    [ValidateSet(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)][int[]]$Phase = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    [ValidateRange(10, 900)][int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$platformRoot = Join-Path $PSScriptRoot 'platform'
$runtimeRoot = Join-Path $platformRoot '.run'
$nodePath = 'C:\ORGANISED\xelor-local\node22\node.exe'
$postgresControl = 'C:\ORGANISED\xelor-local\pgenv\Library\bin\pg_ctl.exe'
$postgresData = 'C:\ORGANISED\xelor-local\pgdata'
$launcherPath = Join-Path $platformRoot 'scripts\phase.mjs'
$productNames = @{ 1 = 'XELOR phase 2 ERP'; 2 = 'ONYX AI intelligence'; 3 = 'AIKYANTRA supplier network'; 4 = 'Integrated workspace'; 5 = 'Plant Operations'; 6 = 'Quality, Safety & Compliance'; 7 = 'Warehouse & Dispatch'; 8 = 'Planning & Engineering'; 9 = 'Revenue & Service'; 10 = 'Delivery & Managed Services' }
$selectedPhases = @($Phase | Sort-Object -Unique)

function Get-NodeSnapshot {
    @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -OperationTimeoutSec 15)
}

function Get-ProcessIdentity($Process) {
    [pscustomobject]@{
        id = [int]$Process.ProcessId
        parentId = [int]$Process.ParentProcessId
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

function Test-State($State, [int]$Number) {
    $State.version -eq 1 -and [int]$State.phase -eq $Number -and
        [string]$State.platform -ieq $platformRoot -and
        [string]$State.owner.executable -ieq $nodePath -and
        [string]$State.owner.command -like ('*' + $launcherPath + '*') -and
        [string]$State.owner.command -match ('\s' + $Number + '\s+start(?:\s|$)')
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

function Get-ListeningPorts {
    $listeners = @{}
    foreach ($line in (& netstat.exe -ano -p TCP)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            $port = [int]$Matches[1]
            if (-not $listeners.ContainsKey($port)) { $listeners[$port] = @() }
            $listeners[$port] = @($listeners[$port]) + [int]$Matches[2]
        }
    }
    $listeners
}

function Get-HttpStatus([string]$Url, [bool]$Demo = $false) {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Timeout = 3000
    $request.ReadWriteTimeout = 3000
    $request.Proxy = $null
    if ($Demo) { $request.Headers.Add('x-xelor-public-demo', 'investor-presentation') }
    $response = $null
    try {
        $response = $request.GetResponse()
        [int]$response.StatusCode
    } catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($null -ne $response) { [int]$response.StatusCode } else { 0 }
    } finally {
        if ($null -ne $response) { $response.Close() }
    }
}

foreach ($required in @($nodePath, $postgresControl, $postgresData, $launcherPath,
        (Join-Path $platformRoot '.env'), (Join-Path $platformRoot 'apps\api\dist\src\main.js'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required local setup is missing: $required" }
}
foreach ($number in $selectedPhases) {
    $buildId = Join-Path $platformRoot "apps\web\.next\phase-$number\BUILD_ID"
    if (-not (Test-Path -LiteralPath $buildId)) { throw "Phase $number needs its production web build: $buildId" }
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$lock = $null
try {
    try {
        $lock = [System.IO.File]::Open((Join-Path $runtimeRoot 'windows-launch.lock'),
            [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch { throw 'Another start-local.ps1 or stop-local.ps1 operation is already running.' }

    # Check every requested port before starting anything. Only recorded process trees
    # may occupy these ports; a listening port alone is not evidence of our application.
    $snapshot = @(Get-NodeSnapshot)
    $listeners = Get-ListeningPorts
    $states = @{}
    foreach ($number in $selectedPhases) {
        $statePath = Join-Path $runtimeRoot "windows-phase-$number.json"
        $state = $null
        $owned = @()
        if (Test-Path -LiteralPath $statePath) {
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if (-not (Test-State $state $number)) { throw "Unrecognized ownership record: $statePath" }
            $owned = @(Get-OwnedTree $state $snapshot)
            $owner = $snapshot | Where-Object { [int]$_.ProcessId -eq [int]$state.owner.id } | Select-Object -First 1
            if (-not (Test-Identity $owner $state.owner)) {
                if ($owned.Count -gt 0) { throw "Phase $number has recorded orphan processes. Run .\stop-local.ps1 -Phase $number before restarting." }
                $state = $null
            }
        }
        $apiPort = 3900 + $number * 100
        foreach ($port in @($apiPort, ($apiPort + 1))) {
            $foreign = @($listeners[$port] | Where-Object { $null -ne $_ -and $_ -notin @($owned.ProcessId) })
            if ($foreign.Count -gt 0) { throw "Port $port belongs to an unowned process (PID $($foreign -join ', ')). No processes were stopped." }
        }
        $states[$number] = $state
    }

    & $postgresControl -D $postgresData status *> $null
    if ($LASTEXITCODE -ne 0) {
        & $postgresControl -D $postgresData -l (Join-Path $runtimeRoot 'postgres.log') -w -t 45 start
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL failed to start. See platform\.run\postgres.log.' }
    }

    foreach ($number in $selectedPhases) {
        if ($null -ne $states[$number]) {
            Write-Host "Phase $number already has an owned launcher; checking readiness."
            continue
        }
        $phaseLog = Join-Path $runtimeRoot "phase-$number"
        New-Item -ItemType Directory -Path $phaseLog -Force | Out-Null
        $arguments = '"{0}" {1} start' -f $launcherPath, $number
        $started = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $platformRoot `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $phaseLog 'windows.stdout.log') `
            -RedirectStandardError (Join-Path $phaseLog 'windows.stderr.log')
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($started.Id)" -OperationTimeoutSec 15
        if ($null -eq $owner) { throw "Phase $number exited during startup. See $phaseLog." }
        $state = [pscustomobject]@{
            version = 1; phase = $number; platform = $platformRoot
            owner = Get-ProcessIdentity $owner; members = @()
        }
        if (-not (Test-State $state $number)) { throw "Cannot validate the new phase $number launcher identity." }
        $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtimeRoot "windows-phase-$number.json") -Encoding UTF8
        $states[$number] = $state
        $state.members = @(Get-OwnedTree $state @(Get-NodeSnapshot) | ForEach-Object { Get-ProcessIdentity $_ })
        $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtimeRoot "windows-phase-$number.json") -Encoding UTF8
        Write-Host "Phase $number started; waiting for its API and web application."
    }

    $demoEnabled = [bool](Get-Content -LiteralPath (Join-Path $platformRoot '.env') | Where-Object { $_ -match '^\s*API_PUBLIC_DEMO\s*=\s*["'']?true["'']?\s*$' })
    if ($null -ne $env:API_PUBLIC_DEMO) { $demoEnabled = $env:API_PUBLIC_DEMO -eq 'true' }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $ready = @{}
    do {
        $snapshot = @(Get-NodeSnapshot)
        $listeners = Get-ListeningPorts
        foreach ($number in $selectedPhases) {
            if ($ready[$number]) { continue }
            $state = $states[$number]
            $owned = @(Get-OwnedTree $state $snapshot)
            $state.members = @($owned | ForEach-Object { Get-ProcessIdentity $_ })
            $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtimeRoot "windows-phase-$number.json") -Encoding UTF8
            $owner = $snapshot | Where-Object { [int]$_.ProcessId -eq [int]$state.owner.id } | Select-Object -First 1
            if (-not (Test-Identity $owner $state.owner)) { throw "Phase $number exited. See platform\.run\phase-$number\windows.stderr.log; use stop-local.ps1 to clean up recorded children." }
            $apiPort = 3900 + $number * 100
            $webPort = $apiPort + 1
            $portOwners = @($listeners[$apiPort]) + @($listeners[$webPort])
            if (-not $listeners.ContainsKey($apiPort) -or -not $listeners.ContainsKey($webPort)) { continue }
            if (@($portOwners | Where-Object { $null -ne $_ -and $_ -notin @($owned.ProcessId) }).Count -gt 0) { throw "An unowned process occupied phase $number ports during startup." }
            $apiStatus = Get-HttpStatus "http://127.0.0.1:$apiPort/api/v1/health"
            $webStatus = Get-HttpStatus "http://127.0.0.1:$webPort/home"
            $proxyStatus = Get-HttpStatus "http://127.0.0.1:$webPort/api/v1/health"
            $identityStatus = if ($demoEnabled) { Get-HttpStatus "http://127.0.0.1:$webPort/api/v1/me" $true } else { 200 }
            if ($apiStatus -eq 200 -and $webStatus -eq 200 -and $proxyStatus -eq 200 -and $identityStatus -eq 200) {
                $ready[$number] = $true
                Write-Host ("Ready: {0} - http://localhost:{1}" -f $productNames[$number], $webPort)
            }
        }
        if ($ready.Count -eq $selectedPhases.Count) { break }
        if ([DateTime]::UtcNow -lt $deadline) { Start-Sleep -Seconds 2 }
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($ready.Count -ne $selectedPhases.Count) {
        $pending = @($selectedPhases | Where-Object { -not $ready[$_] })
        throw "Readiness timed out for phase(s) $($pending -join ', '). Processes remain available for diagnosis in platform\.run; no readiness claim is made for them."
    }
    Write-Host 'All selected applications passed HTTP and proxy checks. Data was preserved.'
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
}
