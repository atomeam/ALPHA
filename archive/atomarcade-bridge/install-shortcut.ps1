# AtoMind — desktop shortcut installer (v0.6.5).
#
# Creates "AtoMind Home Base.lnk" on the user's Desktop targeting the
# v0.6.5 splash launcher (homebase-launcher.ps1). Falls back to
# homebase-desktop.ps1 then homebase.ps1 if the splash launcher is missing.
#
# Also removes the legacy "AtomArcade Home Base.lnk" if present
# (idempotent cleanup as part of the v0.6.5 AtoMind rename).
#
# Usage from the repo folder:
#   pwsh -File install-shortcut.ps1

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$Splash   = Join-Path $RepoRoot 'homebase-launcher.ps1'
$Desktop  = Join-Path $RepoRoot 'homebase-desktop.ps1'
$Bridge   = Join-Path $RepoRoot 'homebase.ps1'

if (Test-Path $Splash) {
    $Target = $Splash
    Write-Host 'Target: homebase-launcher.ps1 (v0.6.5 splash launcher)' -ForegroundColor Cyan
} elseif (Test-Path $Desktop) {
    $Target = $Desktop
    Write-Host 'Target: homebase-desktop.ps1 (legacy desktop launcher fallback)' -ForegroundColor Yellow
} elseif (Test-Path $Bridge) {
    $Target = $Bridge
    Write-Host 'Target: homebase.ps1 (server only fallback)' -ForegroundColor Yellow
} else {
    throw "No launcher found in $RepoRoot. Did you 'git clone' first?"
}

# Find a PowerShell executable (prefer pwsh 7+)
$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
$Pwsh = if ($pwshCmd) { $pwshCmd.Source } else { (Get-Command powershell).Source }

$DesktopDir = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $DesktopDir)) { $DesktopDir = Join-Path $env:USERPROFILE 'Desktop' }

# Idempotent legacy cleanup: remove the old AtomArcade-named .lnk if it exists
$LegacyLnk = Join-Path $DesktopDir 'AtomArcade Home Base.lnk'
if (Test-Path $LegacyLnk) {
    Remove-Item -Path $LegacyLnk -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Removed legacy: $LegacyLnk" -ForegroundColor DarkYellow
}

$LnkPath = Join-Path $DesktopDir 'AtoMind Home Base.lnk'

$Shell = New-Object -ComObject WScript.Shell
$Lnk   = $Shell.CreateShortcut($LnkPath)
$Lnk.TargetPath       = $Pwsh
$Lnk.Arguments        = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$Target`""
$Lnk.WorkingDirectory = $RepoRoot
$Lnk.Description      = 'AtoMind Home Base — Automation Center'
$Lnk.IconLocation     = "$env:SystemRoot\System32\imageres.dll,109"
$Lnk.WindowStyle      = 7
$Lnk.Save()

Write-Host ''
Write-Host "✓ Created: $LnkPath" -ForegroundColor Green
Write-Host "  Runs:    $Target" -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Double-click the desktop icon to launch AtoMind Home Base.' -ForegroundColor Cyan
