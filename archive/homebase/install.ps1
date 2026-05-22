# HomeBase installer
# One-line install (PowerShell):
#   irm https://raw.githubusercontent.com/atomeam/HomeBase-/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AppDir  = Join-Path $env:USERPROFILE 'HomeBase'
$Desktop = [Environment]::GetFolderPath('Desktop')
$Lnk     = Join-Path $Desktop 'HomeBase.lnk'
$Base    = 'https://raw.githubusercontent.com/atomeam/HomeBase-/main/mini'

Write-Host ''
Write-Host '[HomeBase] Installing to ' -NoNewline
Write-Host $AppDir -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

# Download app files from the repo
Invoke-WebRequest "$Base/index.html"           -OutFile (Join-Path $AppDir 'index.html')           -UseBasicParsing
Invoke-WebRequest "$Base/icon.svg"             -OutFile (Join-Path $AppDir 'icon.svg')             -UseBasicParsing
Invoke-WebRequest "$Base/manifest.webmanifest" -OutFile (Join-Path $AppDir 'manifest.webmanifest') -UseBasicParsing

# Render a real .ico in code (no external tools required)
Add-Type -AssemblyName System.Drawing

$canvas = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(10,10,10))

# Outer border (rounded)
$borderPen  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(39,39,42), 2)
$borderPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$br = 48
$borderPath.AddArc(2, 2, $br*2, $br*2, 180, 90)
$borderPath.AddArc(256-$br*2-2, 2, $br*2, $br*2, 270, 90)
$borderPath.AddArc(256-$br*2-2, 256-$br*2-2, $br*2, $br*2, 0, 90)
$borderPath.AddArc(2, 256-$br*2-2, $br*2, $br*2, 90, 90)
$borderPath.CloseAllFigures()
$g.DrawPath($borderPen, $borderPath)

# HOMEBASE button (rounded)
$btnW = 200; $btnH = 72
$bx = ([single](256 - $btnW)/2); $by = ([single](256 - $btnH)/2)
$btnPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 14
$btnPath.AddArc($bx, $by, $r*2, $r*2, 180, 90)
$btnPath.AddArc($bx+$btnW-$r*2, $by, $r*2, $r*2, 270, 90)
$btnPath.AddArc($bx+$btnW-$r*2, $by+$btnH-$r*2, $r*2, $r*2, 0, 90)
$btnPath.AddArc($bx, $by+$btnH-$r*2, $r*2, $r*2, 90, 90)
$btnPath.CloseAllFigures()
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24,24,27))), $btnPath)
$g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(63,63,70), 2)), $btnPath)

# Text "HOMEBASE"
$font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment     = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF($bx, $by, $btnW, $btnH)
$g.DrawString('HOMEBASE', $font, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244,244,245))), $rect, $sf)

# Status dot
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34,197,94))), 220, 220, 14, 14)

$g.Dispose()

# Pack multi-resolution PNG-based .ico
$IconPath = Join-Path $AppDir 'icon.ico'
$Sizes = @(16, 32, 48, 64, 128, 256)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$Sizes.Count)

$Imgs = New-Object System.Collections.ArrayList
foreach ($s in $Sizes) {
    $bm = New-Object System.Drawing.Bitmap $s, $s
    $bg = [System.Drawing.Graphics]::FromImage($bm)
    $bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $bg.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $bg.DrawImage($canvas, 0, 0, $s, $s)
    $bg.Dispose()
    $tmp = New-Object System.IO.MemoryStream
    $bm.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    [void]$Imgs.Add(@{ size = $s; bytes = $tmp.ToArray() })
    $tmp.Dispose(); $bm.Dispose()
}

$offset = 6 + ($Sizes.Count * 16)
foreach ($i in $Imgs) {
    $w = if ($i.size -ge 256) { 0 } else { $i.size }
    $bw.Write([Byte]$w); $bw.Write([Byte]$w); $bw.Write([Byte]0); $bw.Write([Byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$i.bytes.Length); $bw.Write([UInt32]$offset)
    $offset += $i.bytes.Length
}
foreach ($i in $Imgs) { $bw.Write($i.bytes) }

$bw.Flush()
[IO.File]::WriteAllBytes($IconPath, $ms.ToArray())
$ms.Dispose(); $canvas.Dispose()

# Desktop shortcut with custom .ico
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($Lnk)
$sc.TargetPath       = Join-Path $AppDir 'index.html'
$sc.IconLocation     = "$IconPath,0"
$sc.WorkingDirectory = $AppDir
$sc.Description      = 'HomeBase'
$sc.Save()

Write-Host ''
Write-Host '[HomeBase] Done.' -ForegroundColor Green
Write-Host ('  App folder    : ' + $AppDir)
Write-Host ('  Icon          : ' + $IconPath)
Write-Host ('  Desktop icon  : ' + $Lnk)
Write-Host ''
Write-Host 'Double-click "HomeBase" on your desktop to launch.'
