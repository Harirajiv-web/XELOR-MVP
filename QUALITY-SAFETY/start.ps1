# Quality, Safety & Compliance uses the shared, ownership-checked Windows launchers.
[CmdletBinding()]
param(
    [ValidateSet('start', 'build', 'stop')][string]$Action = 'start',
    [ValidateRange(10, 900)][int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
switch ($Action) {
    'build' { & (Join-Path $workspaceRoot 'build-local.ps1') -Phase 6 }
    'stop' { & (Join-Path $workspaceRoot 'stop-local.ps1') -Phase 6 }
    'start' { & (Join-Path $workspaceRoot 'start-local.ps1') -Phase 6 -TimeoutSeconds $TimeoutSeconds }
}
