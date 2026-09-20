param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Fixture,
  [string]$PreviousInstaller
)
$ErrorActionPreference = 'Stop'
# This script intentionally refuses personal workstations. GitHub-hosted runners
# are disposable Windows accounts; use a separate equivalent runner for local QA.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Installer smoke requires a disposable GitHub-hosted Windows runner.'
}
$smokeRoot = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'draftsim-install-smoke'))
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
if (-not $smokeRoot.StartsWith($runnerRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test directory.' }
$installRoot = Join-Path $smokeRoot 'application'
$testData = Join-Path $env:APPDATA 'app.draftsim.desktop'
# Local-loopback CDP drives the installed WebView on this disposable runner.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333'
if (Test-Path -LiteralPath $testData) { throw 'Existing application data detected; refusing to modify it.' }
New-Item -ItemType Directory -Path $smokeRoot, $testData -Force | Out-Null
Copy-Item -LiteralPath (Resolve-Path -LiteralPath $Fixture).Path -Destination (Join-Path $testData 'draftsim-store.json')
function Install-TestBuild([string]$path) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $process = Start-Process -FilePath $resolved -ArgumentList @('/S', "/D=$installRoot") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { throw 'Installer timed out.' }
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
}
function Open-And-Close {
  $binary = Join-Path $installRoot 'app.exe'
  if (-not (Test-Path -LiteralPath $binary)) { throw 'Installed executable missing.' }
  # Start directly so the test-only WebView environment reaches the app even
  # when Windows shell execution would broker the process through Explorer.
  $startInfo = [Diagnostics.ProcessStartInfo]::new($binary)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $startInfo.Environment['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=9333'
  $process = [Diagnostics.Process]::Start($startInfo)
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  do {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) { throw 'Application exited during startup.' }
  } while ($process.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
  if ($process.MainWindowHandle -eq 0) { throw 'Application window did not initialize.' }
  & node "$PSScriptRoot/desktop-navigation-smoke.mjs" $smokeRoot
  if ($LASTEXITCODE -ne 0) {
    Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('app.exe', 'msedgewebview2.exe') } |
      Select-Object Name, ProcessId, ParentProcessId, CommandLine |
      ConvertTo-Json | Set-Content -LiteralPath (Join-Path $smokeRoot 'native-processes.json')
    throw 'Native Escape/navigation smoke failed.'
  }
  if (-not $process.CloseMainWindow()) { throw 'Unable to request normal application close.' }
  if (-not $process.WaitForExit(45000)) { throw 'Application did not complete its save/close lifecycle.' }
  if ($process.ExitCode -ne 0) { throw "Application failed: $($process.ExitCode)" }
  & python "$PSScriptRoot/verify-install-save.py" (Join-Path $testData 'draftsim.db')
  if ($LASTEXITCODE -ne 0) { throw 'Saved data or migration verification failed.' }
}
if ($PreviousInstaller) { Install-TestBuild $PreviousInstaller } else { Install-TestBuild $Installer }
Open-And-Close
Open-And-Close
Install-TestBuild $Installer
Open-And-Close
@{
  install = 'passed'; reopen = 'passed'; legacyJsonMigration = 'passed'; persistenceAfterReinstall = 'passed'
  previousVersionUpgrade = $(if ($PreviousInstaller) { 'passed' } else { 'not run: previous installer not supplied' })
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $smokeRoot 'result.json') -Encoding utf8
