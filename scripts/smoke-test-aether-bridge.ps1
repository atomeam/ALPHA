#Requires -Version 7.0
<#
.SYNOPSIS
    Smoke test for aether-bridge Worker.

.DESCRIPTION
    Tests the deployed aether-bridge Worker using curl.exe.

.PARAMETER BaseUrl
    The base URL of the deployed worker (default: prompt).

.PARAMETER Token
    The BRIDGE_API_TOKEN for authentication (default: prompt).

.EXAMPLE
    .\smoke-test-aether-bridge.ps1
    Run smoke test with prompts.

.EXAMPLE
    .\smoke-test-aether-bridge.ps1 -BaseUrl "https://aether-bridge.xxx.workers.dev" -Token "abc123"
    Run smoke test non-interactively.
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

# =============================================================================
# Get Configuration
# =============================================================================

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = Read-Host "Enter worker BaseUrl (e.g., https://aether-bridge.xxx.workers.dev)"
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    $SecureToken = Read-Host "Enter BRIDGE_API_TOKEN" -AsSecureString
    $Token = [System.Net.NetworkCredential]::new("", $SecureToken).Password
}

if ([string]::IsNullOrWhiteSpace($BaseUrl) -or [string]::IsNullOrWhiteSpace($Token)) {
    Write-Error "Both BaseUrl and Token are required"
    exit 1
}

# Ensure trailing slash removed
$BaseUrl = $BaseUrl.TrimEnd('/')

Write-Host "=== Aether Bridge Smoke Test ===" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Gray

# Generate correlation ID
$CorrelationId = [guid]::NewGuid().ToString()
Write-Host "Correlation ID: $CorrelationId" -ForegroundColor Gray

# Helper function for API calls
function Invoke-BridgeApi {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Body = ""
    )
    
    $Url = "$BaseUrl$Endpoint"
    $Headers = @{
        "Authorization" = "Bearer $Token"
        "X-Correlation-ID" = $CorrelationId
        "Content-Type" = "application/json"
    }
    
    $Params = @{
        Uri = $Url
        Method = $Method
        Headers = $Headers
    }
    
    if ($Body) {
        $Params.Body = $Body
    }
    
    Write-Host "  → $Method $Endpoint" -ForegroundColor Gray
    
    try {
        $Response = curl.exe @Params 2>&1
        $ExitCode = $LASTEXITCODE
        
        if ($ExitCode -eq 0) {
            return @{
                Success = $true
                Body = $Response
            }
        } else {
            return @{
                Success = $false
                Error = $Response
            }
        }
    } catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

# =============================================================================
# Test 1: Health Check
# =============================================================================

Write-Host "`n--- Test 1: Health Check ---" -ForegroundColor Yellow

$Health = Invoke-BridgeApi -Method "GET" -Endpoint "/health"

if ($Health.Success) {
    Write-Host "  ✓ Health check passed" -ForegroundColor Green
    Write-Host "  Response: $($Health.Body)" -ForegroundColor Gray
    
    # Parse JSON and check bindings
    try {
        $HealthJson = $Health.Body | ConvertFrom-Json
        Write-Host "`n  Bindings Status:" -ForegroundColor White
        if ($HealthJson.bindings) {
            $HealthJson.bindings.PSObject.Properties | ForEach-Object {
                $Status = if ($_.Value -eq "present") { "✓" } else { "✗" }
                $Color = if ($_.Value -eq "present") { "Green" } else { "Red" }
                Write-Host "    $Status $($_.Name): $($_.Value)" -ForegroundColor $Color
            }
        }
    } catch {
        Write-Warning "  Could not parse health response as JSON"
    }
} else {
    Write-Host "  ✗ Health check failed" -ForegroundColor Red
    Write-Host "  Error: $($Health.Error)" -ForegroundColor Red
    exit 1
}

# =============================================================================
# Test 2: State Write/Read Roundtrip
# =============================================================================

Write-Host "`n--- Test 2: State Write/Read Roundtrip ---" -ForegroundColor Yellow

$StateKey = "test:smoke:$([DateTimeOffset]::Now.ToUnixTimeSeconds())"
$StateValue = @{
    test = $true
    timestamp = [DateTime]::UtcNow.ToString("o")
    smoke_test = $true
} | ConvertTo-Json -Compress

Write-Host "  Writing state key: $StateKey" -ForegroundColor Gray

$Write = Invoke-BridgeApi -Method "POST" -Endpoint "/state" -Body @"
{
  "key": "$StateKey",
  "value": $StateValue,
  "ttl_seconds": 3600
}
"@

if ($Write.Success) {
    Write-Host "  ✓ State write accepted" -ForegroundColor Green
    
    # Generate new correlation ID for read
    $CorrelationId = [guid]::NewGuid().ToString()
    
    # Read state back
    Write-Host "  Reading state key: $StateKey" -ForegroundColor Gray
    $Read = Invoke-BridgeApi -Method "GET" -Endpoint "/state/$StateKey"
    
    if ($Read.Success) {
        Write-Host "  ✓ State read succeeded" -ForegroundColor Green
        Write-Host "  Response: $($Read.Body)" -ForegroundColor Gray
        
        # Verify data integrity
        if ($Read.Body -match '"smoke_test":\s*true') {
            Write-Host "  ✓ Data integrity verified" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Data mismatch" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✗ State read failed" -ForegroundColor Red
        Write-Host "  Error: $($Read.Error)" -ForegroundColor Red
    }
} else {
    Write-Host "  ⚠ State write failed (endpoint may not be implemented)" -ForegroundColor Yellow
    Write-Host "  Error: $($Write.Error)" -ForegroundColor Gray
}

# =============================================================================
# Test 3: Queue Test (Async Proposal)
# =============================================================================

Write-Host "`n--- Test 3: Queue Test (Async Proposal) ---" -ForegroundColor Yellow

$CorrelationId = [guid]::NewGuid().ToString()
$ProposeBody = @"
{
  "title": "Smoke Test Proposal",
  "inputs_hash": "smoke-test-001",
  "change_summary": "Smoke test - can be ignored",
  "expected_effect": {
    "metric": "routing.success_rate",
    "direction": "increase",
    "magnitude": 0.01,
    "tolerance": 0.005
  },
  "rollback_steps": ["revert"],
  "risk_class": "low",
  "classification": "test",
  "idempotent": true,
  "mode": "async"
}
"@

$Propose = Invoke-BridgeApi -Method "POST" -Endpoint "/propose" -Body $ProposeBody

if ($Propose.Success) {
    Write-Host "  ✓ Proposal endpoint responded" -ForegroundColor Green
    Write-Host "  Response: $($Propose.Body)" -ForegroundColor Gray
    
    # Check for queue_id in response
    if ($Propose.Body -match '"queue_id"') {
        Write-Host "  ✓ Async queue working" -ForegroundColor Green
    } elseif ($Propose.Body -match '"status"') {
        $Status = ($Propose.Body | ConvertFrom-Json).status
        Write-Host "  → Status: $Status" -ForegroundColor Cyan
    }
} else {
    Write-Host "  ⚠ Proposal endpoint failed (may not be implemented)" -ForegroundColor Yellow
    Write-Host "  Error: $($Propose.Error)" -ForegroundColor Gray
}

# =============================================================================
# Test 4: Manual Audit Check
# =============================================================================

Write-Host "`n--- Test 4: Manual Audit Check ---" -ForegroundColor Yellow
Write-Host "To verify audit_events table, run:" -ForegroundColor Cyan
Write-Host "  wrangler d1 execute aether-bridge-db --command `"SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 10`" --remote" -ForegroundColor Gray
Write-Host ""
Write-Host "Or check D1 via Cloudflare Dashboard:" -ForegroundColor Cyan
Write-Host "  Workers & Pages > aether-bridge > D1 > aether-bridge-db > Query" -ForegroundColor Gray

# =============================================================================
# Summary
# =============================================================================

Write-Host "`n=== Smoke Test Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "If all tests passed, deployment is healthy." -ForegroundColor White
Write-Host "Check D1 for audit_events to confirm all requests were logged." -ForegroundColor Gray