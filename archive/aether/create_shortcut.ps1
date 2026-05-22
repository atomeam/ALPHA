# Aether Desktop Shortcut Creator
# Run this on your Windows machine

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Aether.lnk")
$Shortcut.TargetPath = "http://localhost:3000"
$Shortcut.Description = "Aether - Alpha Engine"
$Shortcut.Save()

Write-Host "✅ Aether shortcut created on Desktop!" -ForegroundColor Green
