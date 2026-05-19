# tools/proposals-watcher.ps1
# Dispatcher: ProposalsWatcher (v0.1-Heist)

param(
    [string]$EnvFile = ".env",
    [switch]$UseMock = $false
)

# 1. Resilience: Local .env Shim
$envPath = Join-Path $PSScriptRoot $EnvFile
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        $key, $value = $_ -split '=', 2
        if ($key -and $value) {
            [Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), "Process")
        }
    }
    Write-Host "[Status] Environment loaded from .env shim."
} else {
    Write-Warning "[Alert] No .env found. Running in MOCK_MODE."
    $UseMock = $true
}

# 2. Heist Variables
$notionApiKey = $env:NOTION_API_KEY
$dbId = $env:PROPOSALS_DB_ID
$pollInterval = 5000  # ms

Write-Host "[Dispatcher] ProposalsWatcher initialized."
Write-Host "  Poll interval: ${pollInterval}ms"
Write-Host "  Source: $(if ($UseMock) { 'Mock' } elseif ($notionApiKey) { 'Notion API' } else { 'Local fallback' })"

# 3. Mock Mode
$MOCK_PROPOSALS = @(
    @{ id = "mock_prop_001"; title = "Mock Proposal - Test"; status = "pending_review"; summary = "Mock response for testing" }
)

# Helper functions
function Get-ProposalsFromNotion {
    param([string]$ApiKey, [string]$DatabaseId)
    
    if ($UseMock) {
        Write-Host "[Watcher] Using mock responses"
        return $MOCK_PROPOSALS
    }
    
    if (-not $ApiKey -or -not $DatabaseId) {
        throw "NOTION_API_KEY or PROPOSALS_DB_ID not set"
    }
    
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Notion-Version" = "2022-06-28"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/$DatabaseId/query" -Method Post -Headers $headers
        return $response.results | ForEach-Object {
            @{
                id = $_.id
                title = $_.properties.Title.title[0].plain_text
                status = $_.properties.Status.status.name
                summary = $_.properties.Summary.rich_text[0].plain_text
            }
        }
    } catch {
        Write-Warning "[Alert] Notion API error: $($_.Exception.Message)"
        return @()
    }
}

function Get-ProposalsFromLocal {
    $logPath = Join-Path $PSScriptRoot "logs\proposals.jsonl"
    if (-not (Test-Path $logPath)) { return @() }
    
    Get-Content $logPath | ConvertFrom-Json | Where-Object { $_.status -eq "pending_review" -or $_.status -eq "draft" }
}

function Invoke-Dispatcher {
    param($Proposal)
    
    Write-Host "[Dispatcher] Dispatching proposal: $($Proposal.id)"
    Write-Host "  Title: $($Proposal.title)"
    Write-Host "  Status: $($Proposal.status)"
}

# 4. Main Loop
$lastIds = @()

while ($true) {
    try {
        $hasApi = $notionApiKey -and $dbId
        $proposals = if ($hasApi) { 
            Get-ProposalsFromNotion -ApiKey $notionApiKey -DatabaseId $dbId 
        } else { 
            Get-ProposalsFromLocal 
        }
        
        $newProposals = $proposals | Where-Object { $lastIds -notcontains $_.id }
        
        if ($newProposals) {
            Write-Host "[Dispatcher] $($newProposals.Count) new proposal(s) detected"
            $newProposals | ForEach-Object { Invoke-Dispatcher -Proposal $_ }
        }
        
        $lastIds = $proposals.id
        
    } catch {
        Write-Error "[Dispatcher] Heartbeat failure: $($_.Exception.Message)"
    }
    
    Start-Sleep -Milliseconds $pollInterval
}