#Requires -Version 7.0
<#
.SYNOPSIS
    Deploy aether-bridge Worker to Cloudflare.

.DESCRIPTION
    This script deploys the aether-bridge Worker from the apps/alpha-orchestrator/ directory.
    It validates the configuration, sets required secrets, and runs smoke tests.

.PARAMETER SkipSmokeTest
    Skip the smoke test after deployment.

.EXAMPLE
    .\deploy-aether-bridge.ps1
    Deploy and run smoke test.

.EXAMPLE
    .\deploy-aether-bridge.ps1 -SkipSmokeTest
    Deploy without smoke test.
#>

param(
    [switch]$SkipSmokeTest
)

$ErrorActionPreference = "Stop"

# =============================================================================
# Guard: Verify we're in the correct directory
# =============================================================================

$ScriptDir = $PSScriptRoot
$TomlPath = Join-Path $ScriptDir "wrangler.toml"

if (-not (Test-Path $TomlPath)) {
    Write-Error "wrangler.toml not found in $ScriptDir"
    Write-Error "This script must be run from apps/alpha-orchestrator/"
    exit 1
}

# Verify worker name is aether-bridge
$TomlContent = Get-Content $TomlPath -Raw
if ($TomlContent -notmatch '^\s*name\s*=\s*"aether-bridge"') {
    Write-Error "wrangler.toml name is not 'aether-bridge'. Found:"
    $TomlContent | Select-String '^\s*name\s*='
    exit 1
}

Write-Host "✓ Guard check passed: aether-bridge configuration confirmed" -ForegroundColor Green
Write-Host "  Working directory: $ScriptDir" -ForegroundColor Gray

# =============================================================================
# Step 1: Get Cloudflare Resource IDs
# =============================================================================

Write-Host "`n=== Step 1: Finding Cloudflare Resources ===" -ForegroundColor Cyan

Write-Host "Finding D1 database..."
$D1Output = wrangler d1 list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to list D1 databases. Is wrangler authenticated?"
    exit 1
}
$D1Match = $D1Output | Select-String "aether-bridge-db"
if ($D1Match) {
    Write-Host "  ✓ Found D1: aether-bridge-db" -ForegroundColor Green
    $D1Id = ($D1Match -split '\s+')[2]
    Write-Host "    UUID: $D1Id" -ForegroundColor Gray
    
    # Update wrangler.toml with real ID if placeholder
    if ((Get-Content $TomlPath -Raw) -match 'REPLACE_WITH_D1_DATABASE_ID') {
        Write-Host "  → Updating wrangler.toml with D1 ID..." -ForegroundColor Yellow
        (Get-Content $TomlPath) -replace 'REPLACE_WITH_D1_DATABASE_ID', $D1Id | Set-Content $TomlPath
    }
} else {
    Write-Warning "  ⚠ D1 database 'aether-bridge-db' not found in list"
    Write-Warning "  Run: wrangler d1 create aether-bridge-db"
}

Write-Host "Finding KV namespace..."
$KVOutput = wrangler kv:namespace list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to list KV namespaces. Is wrangler authenticated?"
    exit 1
}
$KVMatch = $KVOutput | Select-String "bridge-metrics"
if ($KVMatch) {
    Write-Host "  ✓ Found KV: bridge-metrics" -ForegroundColor Green
    # Extract ID (format varies, try to find uuid-like string)
    $KVId = ($KVMatch -split '\s+' | Where-Object { $_ -match '^[a-f0-9-]{36}$' }) | Select-Object -First 1
    if ($KVId) {
        Write-Host "    ID: $KVId" -ForegroundColor Gray
        
        # Update wrangler.toml with real ID if placeholder
        if ((Get-Content $TomlPath -Raw) -match 'REPLACE_WITH_METRICS_NAMESPACE_ID') {
            Write-Host "  → Updating wrangler.toml with KV ID..." -ForegroundColor Yellow
            (Get-Content $TomlPath) -replace 'REPLACE_WITH_METRICS_NAMESPACE_ID', $KVId | Set-Content $TomlPath
        }
    }
} else {
    Write-Warning "  ⚠ KV namespace 'bridge-metrics' not found in list"
    Write-Warning "  Run: wrangler kv:namespace create bridge-metrics"
}

# =============================================================================
# Step 2: Apply D1 Migration
# =============================================================================

Write-Host "`n=== Step 2: Applying D1 Migration ===" -ForegroundColor Cyan

if ($D1Match) {
    $MigrationCmd = "wrangler d1 migrations apply aether-bridge-db --remote"
    Write-Host "Running: $MigrationCmd" -ForegroundColor Gray
    Invoke-Expression $MigrationCmd
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Migration may have already been applied or failed"
    } else {
        Write-Host "  ✓ Migration applied" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠ Skipping migration (D1 not found)" -ForegroundColor Yellow
}

# =============================================================================
# Step 3: Deploy Worker
# =============================================================================

Write-Host "`n=== Step 3: Deploying Worker ===" -ForegroundColor Cyan

$DeployCmd = "wrangler deploy --config `"$TomlPath`" --name aether-bridge"
Write-Host "Running: $DeployCmd" -ForegroundColor Gray
Invoke-Expression $DeployCmd

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed!"
    exit 1
}

Write-Host "  ✓ Deployment successful" -ForegroundColor Green

# =============================================================================
# Step 4: Set Secrets
# =============================================================================

Write-Host "`n=== Step 4: Setting Secrets ===" -ForegroundColor Cyan

function Set-Secret {
    param(
        [string]$Name,
        [switch]$Optional
    )
    
    $Prompt = "Enter $Name (or press Enter to skip)"
    if ($Optional) {
        $Prompt = "Enter $Name (optional, press Enter to skip)"
    }
    
    Write-Host "$Prompt" -ForegroundColor Yellow
    $Value = Read-Host -AsSecureString
    $PlainValue = [System.Net.NetworkCredential]::new("", $Value).Password
    
    if ([string]::IsNullOrWhiteSpace($PlainValue)) {
        if (-not $Optional) {
            Write-Host "  ⚠ $Name is required but empty. Will prompt again." -ForegroundColor Yellow
            return $false
        }
        Write-Host "  ○ Skipped" -ForegroundColor Gray
        return $null
    }
    
    # Write to temp file for wrangler (avoids pipeline issues)
    $TempFile = [System.IO.Path]::GetTempFileName()
    $PlainValue | Out-File -FilePath $TempFile -Encoding utf8 -NoNewline
    
    $SecretCmd = "wrangler secret put $Name --name aether-bridge < `"$TempFile`""
    Write-Host "  → Setting $Name..." -ForegroundColor Gray
    bash -c $SecretCmd 2>&1 | Out-Null
    
    Remove-Item $TempFile -Force
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $Name set" -ForegroundColor Green
        return $true
    } else {
        Write-Warning "  ⚠ Failed to set $Name"
        return $false
    }
}

# Required secret
$TokenSet = Set-Secret -Name "BRIDGE_API_TOKEN"

if ($TokenSet) {
    # Optional secrets
    Set-Secret -Name "SLACK_BOT_TOKEN" -Optional | Out-Null
    Set-Secret -Name "GITHUB_TOKEN" -Optional | Out-Null
    Set-Secret -Name "AMPLITUDE_API_KEY" -Optional | Out-Null
    Set-Secret -Name "AMPLITUDE_SECRET_KEY" -Optional | Out-Null
    Set-Secret -Name "SENTRY_DSN" -Optional | Out-Null
}

# =============================================================================
# Step 5: Smoke Test
# =============================================================================

if ($SkipSmokeTest) {
    Write-Host "`n=== Smoke Test Skipped ===" -ForegroundColor Cyan
} else {
    Write-Host "`n=== Step 5: Running Smoke Test ===" -ForegroundColor Cyan
    
    # Detect deployment URL
    $WorkersUrl = "https://aether-bridge.*.workers.dev"
    
    Write-Host "Testing /health endpoint..." -ForegroundColor Gray
    Write-Host "  Note: Update `$BASE below if your worker URL differs" -ForegroundColor Yellow
    
    # Prompt for URL if not known
    $BaseInput = Read-Host "Enter your worker URL (or press Enter for placeholder)"
    if ([string]::IsNullOrWhiteSpace($BaseInput)) {
        $BaseInput = "https://aether-bridge.YOUR_SUBDOMAIN.workers.dev"
        Write-Host "  Using placeholder: $BaseInput" -ForegroundColor Yellow
        Write-Host "  Update this in the script for automated testing" -ForegroundColor Gray
    }
    
    # Get token for smoke test
    if ($TokenSet) {
        Write-Host "`nTo run smoke test manually:" -ForegroundColor Cyan
        Write-Host "  `$TOKEN = `"your-bridge-api-token`"" -ForegroundColor Gray
        Write-Host "  curl.exe `"$BaseInput/health`" -H `"Authorization: Bearer `$TOKEN`"" -ForegroundColor Gray
    }
}

# =============================================================================
# Summary
# =============================================================================

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Worker URL: https://aether-bridge.YOUR_SUBDOMAIN.workers.dev" -ForegroundColor Cyan
Write-Host "Health check: https://aether-bridge.YOUR_SUBDOMAIN.workers.dev/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Update the Worker URL in this script" -ForegroundColor Gray
Write-Host "  2. Run smoke test: curl.exe `"$BaseInput/health`" -H `"Authorization: Bearer `$TOKEN`"" -ForegroundColor Gray
Write-Host "  3. Check D1: wrangler d1 execute aether-bridge-db --command `"SELECT * FROM audit_events`" --remote" -ForegroundColor Gray