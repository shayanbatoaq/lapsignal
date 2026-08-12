[CmdletBinding()]
param(
  [ValidateSet('setup','init','app','live','collector','replay','verify')][string]$Action='app',
  [string]$Capture
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location $repo
try {
  $commands=@{
    setup=@('setup'); init=@('db:init'); app=@('dev:app-start'); live=@('dev:live')
    collector=@('collector:listen'); replay=@('collector:replay'); verify=@('check')
  }
  if($Action -eq 'replay' -and [string]::IsNullOrWhiteSpace($Capture)){
    throw 'Replay requires an explicit local capture path.'
  }
  $arguments=@($commands[$Action])
  if($Action -eq 'replay'){$arguments+=@('--',$Capture)}
  & corepack pnpm @arguments
  if($LASTEXITCODE -ne 0){throw "LapSignal $Action failed with exit code $LASTEXITCODE"}
} finally { Pop-Location }
