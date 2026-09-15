# XELOR phase 2 ERP uses technical profile 1 and the ownership-checked Windows launchers.
[CmdletBinding()]
param(
    [ValidateSet('start', 'build', 'stop')][string]$Action = 'start',
    [ValidateRange(10, 900)][int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
switch ($Action) {
    'build' { & (Join-Path $workspaceRoot 'build-local.ps1') -Phase 1 }
    'stop' { & (Join-Path $workspaceRoot 'stop-local.ps1') -Phase 1 }
    'start' { & (Join-Path $workspaceRoot 'start-local.ps1') -Phase 1 -TimeoutSeconds $TimeoutSeconds }
}
