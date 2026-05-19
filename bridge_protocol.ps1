# Aether - Alpha Stack Operations
# Consolidated PowerShell Script for Windows
# Version: 1.0.0
# Target: Aether Monorepo

param (
    [string]$Command = "help",
    [string]$Target = "backend"
)

$ErrorActionPreference = "SilentlyContinue"

# ============================================================
# CORE COMMANDS
# ============================================================

switch ($Command.ToLower()) {
    "help" {
        Write-Host ""
        Write-Host " Aether - Alpha Stack Operations" -ForegroundColor Cyan
        Write-Host " ==============================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host " Commands:" -ForegroundColor Yellow
        Write-Host "  dev           - Start dev server (backend|frontend|bridge)"
        Write-Host "  build         - Build all packages"
        Write-Host "  test          - Run tests"
        Write-Host "  deploy-cf     - Deploy to Cloudflare Workers"
        Write-Host "  health        - Check system health"
        Write-Host "  status        - Git status"
        Write-Host "  shortcut     - Create desktop shortcut"
        Write-Host "  bridge        - Run bridge protocol"
        Write-Host ""
        Write-Host " Examples:" -ForegroundColor Yellow
        Write-Host "  .\aether.ps1 dev backend"
        Write-Host "  .\aether.ps1 build"
        Write-Host "  .\aether.ps1 health"
        Write-Host ""
    }

    "dev" {
        Write-Host "[DEV] Starting $Target..." -ForegroundColor Cyan
        switch ($Target.ToLower()) {
            "backend" {
                npm run dev:backend
            }
            "frontend" {
                npm run dev:frontend
            }
            "bridge" {
                npm run dev:bridge
            }
            default {
                npm run dev
            }
        }
    }

    "build" {
        Write-Host "[BUILD] Compiling packages..." -ForegroundColor Cyan
        npx turbo run build
    }

    "test" {
        Write-Host "[TEST] Running test suite..." -ForegroundColor Cyan
        npx turbo run test
    }

    "typecheck" {
        Write-Host "[TYPECHECK] Type checking..." -ForegroundColor Cyan
        npx turbo run typecheck
    }

    "deploy-cf" {
        Write-Host "[CLOUDFLARE] Deploying worker..." -ForegroundColor Cyan
        npx wrangler deploy
    }

    "deploy-prod" {
        Write-Host "[CLOUDFLARE] Deploying to production..." -ForegroundColor Cyan
        npx wrangler deploy --env production
    }

    "health" {
        Write-Host "[HEALTH] Checking system status..." -ForegroundColor Cyan
        Write-Host ""
        
        # Git status
        $gitStatus = git status --short 2>$null
        if ($gitStatus) {
            Write-Host "Git: Modified files detected" -ForegroundColor Yellow
            $gitStatus | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        } else {
            Write-Host "Git: Clean" -ForegroundColor Green
        }
        
        # Node version
        $nodeVer = node --version 2>$null
        Write-Host "Node: $nodeVer" -ForegroundColor White
        
        # NPM version
        $npmVer = npm --version 2>$null
        Write-Host "NPM: $npmVer" -ForegroundColor White
        
        # Backend health (if running)
        try {
            $backend = Invoke-RestMethod -Uri "http://localhost:3000/api/stack" -TimeoutSec 2
            Write-Host "Backend: $($backend.status)" -ForegroundColor Green
        } catch {
            Write-Host "Backend: Not running (port 3000)" -ForegroundColor DarkGray
        }
        
        # Frontend health (if running)
        try {
            $frontend = Invoke-RestMethod -Uri "http://localhost:5173" -TimeoutSec 2 -ErrorAction SilentlyContinue
            Write-Host "Frontend: Running (port 5173)" -ForegroundColor Green
        } catch {
            Write-Host "Frontend: Not running (port 5173)" -ForegroundColor DarkGray
        }
        
        Write-Host ""
    }

    "status" {
        Write-Host "[GIT] Status:" -ForegroundColor Cyan
        git status
        Write-Host ""
        Write-Host "[GIT] Log (last 5):" -ForegroundColor Cyan
        git log --oneline -5
    }

    "shortcut" {
        Write-Host "[SHORTCUT] Creating desktop shortcut..." -ForegroundColor Cyan
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Aether.lnk")
        $Shortcut.TargetPath = "http://localhost:3000"
        $Shortcut.Description = "Aether - Alpha Engine"
        $Shortcut.Save()
        Write-Host "Aether shortcut created on Desktop!" -ForegroundColor Green
    }

    "bridge" {
        # Sovereign Bridge Protocol
        Write-Host ""
        Write-Host "[SOVEREIGN_BRIDGE]: Handshake Established." -ForegroundColor Gold
        Write-Host "[IDENTITY]: AXIOM-$(Get-Random -Minimum 1000 -Maximum 9999)" -ForegroundColor Cyan
        
        $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $mem = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
        Write-Host "[TELEMETRY] CPU:$cpu% MEM:$( [math]::Round($mem, 2) GB" -ForegroundColor Blue
        Write-Host ""
        Write-Host "[BRIDGE_IDLE]: Standing by." -ForegroundColor DarkGray
    }

    "clean" {
        Write-Host "[CLEAN] Removing build artifacts..." -ForegroundColor Cyan
        Remove-Item -Recurse -Force "node_modules/.cache" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force ".turbo" -ErrorAction SilentlyContinue
        Get-ChildItem -Path "." -Include "dist" -Recurse -Directory | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Build artifacts cleaned!" -ForegroundColor Green
    }

    default {
        Write-Host "Unknown command: $Command" -ForegroundColor Red
        Write-Host "Run '.\aether.ps1 help' for available commands" -ForegroundColor Gray
    }
}
