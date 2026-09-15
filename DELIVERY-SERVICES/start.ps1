# Delivery & Managed Services uses the shared, ownership-checked Windows launchers.
[CmdletBinding()]
param(
    [ValidateSet('start', 'build', 'stop')][string]$Action = 'start',
    [ValidateRange(10, 900)][int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
switch ($Action) {
    'build' { & (Join-Path $workspaceRoot 'build-local.ps1') -Phase 10 }
    'stop' { & (Join-Path $workspaceRoot 'stop-local.ps1') -Phase 10 }
    'start' { & (Join-Path $workspaceRoot 'start-local.ps1') -Phase 10 -TimeoutSeconds $TimeoutSeconds }
}
