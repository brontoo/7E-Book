param(
  [Parameter(Mandatory=$true)][string]$AppPath,
  [ValidateSet('chrome','msedge')][string]$Browser='chrome'
)
$ErrorActionPreference='Stop'
$expectedCommit='07f4e1fe9ade229efdaf3bfc4b026cba917801b6'
$app=(Resolve-Path -LiteralPath $AppPath).Path
$actual=(& git -C $app rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actual -ne $expectedCommit) { throw 'Wrong Expo checkout. Follow README exact checkout instructions.' }
& git -C $app diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Tracked app changes found. Use the separate clean QA checkout.' }
$portBusy=$false
$probe=New-Object Net.Sockets.TcpClient
try { $pending=$probe.ConnectAsync('127.0.0.1',4174); [void]$pending.Wait(300); $portBusy=$probe.Connected } catch {} finally { $probe.Dispose() }
if ($portBusy) { throw 'Port 4174 is already in use. Stop that preview first; this launcher will not test an unrelated server.' }
$reportRoot=Join-Path $env:USERPROFILE ('Seven-Emirates-QA-Reports\'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$Browser)
New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'educational-acceptance-template.json') -Destination (Join-Path $reportRoot 'educational-acceptance.json')
$qaVenv=Join-Path $env:TEMP 'seven-emirates-browser-qa'
& py -3 -c "import sys; assert sys.version_info >= (3,12), 'Python 3.12 or newer required'"
if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12+ from python.org and enable the Python launcher.' }
& py -3 -m venv $qaVenv
if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
$python=Join-Path $qaVenv 'Scripts\python.exe'
& $python -m pip install playwright==1.62.0
if ($LASTEXITCODE -ne 0) { throw 'Playwright install failed. Keep TLS verification enabled.' }
$flags=@{
 VITE_BOOK_ENGINE='frames';VITE_BOOK_GESTURES='true';
 VITE_BOOK_ASSET_BASE_URL='https://hjqyhybgitdizfhwpdcv.supabase.co/storage/v1/object/public/seven-emirates-game/';
 VITE_BOOK_MEDIA_VERSION='7e-1bc718ef5e77';COREPACK_ENABLE_DOWNLOAD_PROMPT='0'
}
$old=@{};foreach($name in $flags.Keys){$old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$preview=$null
try {
 foreach($name in $flags.Keys){[Environment]::SetEnvironmentVariable($name,$flags[$name],'Process')}
 Push-Location -LiteralPath $app
 try { & corepack pnpm install --frozen-lockfile; if ($LASTEXITCODE -ne 0){throw 'Locked app dependency install failed'} }
 finally { Pop-Location }
 $escaped=$app.Replace("'","''")
 $command="Set-Location -LiteralPath '$escaped'; & corepack pnpm exec vite --host 127.0.0.1 --port 4174 --strictPort"
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
 $preview=Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-EncodedCommand',$encoded -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $reportRoot 'preview.log') -RedirectStandardError (Join-Path $reportRoot 'preview-error.log')
 $ready=$false
 for($i=0;$i -lt 60;$i++){
  if($preview.HasExited){throw 'Preview exited. Check preview-error.log; port 4174 may already be in use.'}
  try { $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4174' -TimeoutSec 1; if($response.StatusCode -eq 200){$ready=$true;break} } catch {}
  Start-Sleep -Milliseconds 500
 }
 if(-not $ready){throw 'Preview did not start'}
 Write-Host "Read-only network tests are running. Reports: $reportRoot"
 & $python (Join-Path $PSScriptRoot 'run-automated.py') --app $app --channel $Browser --report-dir $reportRoot
 $automatedExit=$LASTEXITCODE
 if($automatedExit -ne 0){
  Write-Host 'Automated acceptance is incomplete. This is not a production approval.'
  $browserFile=Join-Path $reportRoot 'browser.json'
  if(-not (Test-Path $browserFile)){throw 'Browser test did not produce a report. Inspect the saved diagnostics.'}
  $result=Get-Content -Raw $browserFile | ConvertFrom-Json
  if(-not $result.remoteVerified -or -not $result.modelInitialized){throw 'Live media or model initialization failed. Inspect JSON reports before physical testing.'}
  Write-Host 'Media/model initialized but another check failed (possibly model-byte comparison). Physical comparison can collect evidence; approval remains blocked.'
 }
 Write-Host 'A real browser will open. No camera starts until you click Enable Hand Controls.'
 Write-Host 'Use the Owner camera QA panel, then Disable Camera and Save and finish.'
 & $python (Join-Path $PSScriptRoot 'physical-camera.py') --app $app --channel $Browser --report (Join-Path $reportRoot 'owner-camera.json')
 if($LASTEXITCODE -ne 0){Write-Host 'Physical session ended early; available diagnostics were saved.'}
} finally {
 if($preview -and -not $preview.HasExited){ & taskkill.exe /PID $preview.Id /T /F | Out-Null }
 foreach($name in $flags.Keys){[Environment]::SetEnvironmentVariable($name,$old[$name],'Process')}
 Write-Host "Reports saved: $reportRoot"
}
