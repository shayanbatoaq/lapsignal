[CmdletBinding()]
param([ValidateSet('setup','seed','demo','live','collector','replay','verify')][string]$Action='demo')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location $repo
try {
  $commands=@{
    setup=@('setup'); seed=@('seed'); demo=@('dev:demo'); live=@('dev:live')
    collector=@('collector:listen'); replay=@('collector:replay'); verify=@('check')
  }
  & corepack pnpm @($commands[$Action])
  if($LASTEXITCODE -ne 0){throw "LapSignal $Action failed with exit code $LASTEXITCODE"}
} finally { Pop-Location }
