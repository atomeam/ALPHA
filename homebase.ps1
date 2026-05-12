# AtomArcade Home Base — v0.2
# Single-file PowerShell HTTP server + Notion Command Bus.
# Run with: pwsh -File homebase.ps1
# Requires: PowerShell 7+, Windows, RetroArch with network_cmd_enable = "true".

$ErrorActionPreference = 'Stop'

# ============================================================
# Config
# ============================================================
$HTTP_PORT       = 8080
$RETROARCH_HOST  = '127.0.0.1'
$RETROARCH_PORT  = 55355
$UDP_TIMEOUT_MS  = 800
$LOG_MAX         = 500
$VERSION         = 'v0.2'

# --- Notion Command Bus ---
# Set these as machine env vars (System Properties > Environment Variables) so the token
# never lives in the script file. Both are read once at boot.
$NOTION_TOKEN          = $env:ATOMARCADE_NOTION_TOKEN
$NOTION_DATABASE_ID    = $env:ATOMARCADE_NOTION_DB_ID
$NOTION_POLL_SECONDS   = 5
$NOTION_API_VERSION    = '2022-06-28'
$NOTION_ENABLED        = -not [string]::IsNullOrWhiteSpace($NOTION_TOKEN) -and -not [string]::IsNullOrWhiteSpace($NOTION_DATABASE_ID)

# --- Curator policy ---
# Which command Kinds are allowed to execute. Flip to $false to hard-disable a kind.
# 'high' Risk commands additionally require ATOMARCADE_ALLOW_HIGH_RISK=1.
$CURATOR_POLICY = @{
    'retroarch'   = $true
    'capture'     = $true
    'observe'     = $true
    'diagnostic'  = $true
    'shell-safe'  = $false   # opt-in: flip to $true after you allowlist commands below
    'curator'     = $true
    'system'      = $true
}
$ALLOW_HIGH_RISK = ($env:ATOMARCADE_ALLOW_HIGH_RISK -eq '1')

# Shell-safe allowlist. Only these exact tokens may run under Kind=shell-safe.
$SHELL_SAFE_ALLOWLIST = @(
    'echo',
    'hostname',
    'whoami',
    'Get-Date',
    'Get-Process retroarch'
)

# ============================================================
# In-memory state
# ============================================================
$script:Log     = [System.Collections.Generic.List[object]]::new()
$script:Started = Get-Date
$script:Hostname = $env:COMPUTERNAME

function Add-LogEntry {
    param([string]$Kind, [string]$Message, [object]$Data = $null)
    $entry = [pscustomobject]@{
        ts      = (Get-Date).ToString('o')
        kind    = $Kind
        message = $Message
        data    = $Data
    }
    $script:Log.Add($entry) | Out-Null
    if ($script:Log.Count -gt $LOG_MAX) {
        $script:Log.RemoveRange(0, $script:Log.Count - $LOG_MAX)
    }
    Write-Host ("[{0}] {1} -- {2}" -f $entry.ts, $Kind, $Message)
}

# ============================================================
# RetroArch UDP helpers
# ============================================================
function Send-RetroArchCommand {
    param([Parameter(Mandatory)][string]$Command)
    $udp = [System.Net.Sockets.UdpClient]::new()
    try {
        $udp.Client.ReceiveTimeout = $UDP_TIMEOUT_MS
        $bytes = [System.Text.Encoding]::ASCII.GetBytes($Command)
        [void]$udp.Send($bytes, $bytes.Length, $RETROARCH_HOST, $RETROARCH_PORT)
        try {
            $ep = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
            $resp = $udp.Receive([ref]$ep)
            return @{ ok = $true; reply = [System.Text.Encoding]::ASCII.GetString($resp).Trim() }
        } catch [System.Net.Sockets.SocketException] {
            return @{ ok = $true; reply = $null }
        }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    } finally {
        $udp.Close()
    }
}

# ============================================================
# Bridge Command dispatcher
# ============================================================
function Invoke-BridgeCommand {
    param(
        [Parameter(Mandatory)][string]$Command,
        [string]$Kind = 'retroarch',
        [string]$Risk = 'low',
        [string]$ArgsJson = $null
    )

    # Curator gate
    if (-not $CURATOR_POLICY[$Kind]) {
        return @{ ok=$false; blocked=$true; reason="Curator: kind '$Kind' is disabled" }
    }
    if ($Risk -eq 'high' -and -not $ALLOW_HIGH_RISK) {
        return @{ ok=$false; blocked=$true; reason="Curator: risk=high blocked. Set ATOMARCADE_ALLOW_HIGH_RISK=1 to permit." }
    }

    $argsObj = @{}
    if ($ArgsJson) {
        try { $argsObj = $ArgsJson | ConvertFrom-Json -AsHashtable } catch { $argsObj = @{} }
    }

    switch ($Kind) {
        'retroarch'   { return Send-RetroArchCommand -Command $Command }
        'diagnostic'  {
            switch ($Command) {
                'PING'        { return @{ ok=$true; reply='pong'; version=$VERSION; hostname=$script:Hostname } }
                'VERSION'     { return Send-RetroArchCommand -Command 'VERSION' }
                'GET_STATUS'  { return Send-RetroArchCommand -Command 'GET_STATUS' }
                'UPTIME'      { return @{ ok=$true; uptime_seconds=[int]((Get-Date)-$script:Started).TotalSeconds } }
                default       { return @{ ok=$false; error="unknown diagnostic: $Command" } }
            }
        }
        'capture'     {
            switch ($Command) {
                'SCREENSHOT'  { return Send-RetroArchCommand -Command 'SCREENSHOT' }
                'SAVE_STATE'  { return Send-RetroArchCommand -Command 'SAVE_STATE' }
                'LOAD_STATE'  { return Send-RetroArchCommand -Command 'LOAD_STATE' }
                default       { return @{ ok=$false; error="unknown capture: $Command" } }
            }
        }
        'observe'     {
            $note = if ($argsObj.note) { $argsObj.note } else { $Command }
            Add-LogEntry -Kind 'OBSERVE' -Message $note
            return @{ ok=$true; note=$note; recorded_at=(Get-Date).ToString('o') }
        }
        'shell-safe'  {
            if ($SHELL_SAFE_ALLOWLIST -notcontains $Command) {
                return @{ ok=$false; blocked=$true; reason="shell-safe command not on allowlist" }
            }
            try {
                $out = Invoke-Expression $Command 2>&1 | Out-String
                return @{ ok=$true; reply=$out.Trim() }
            } catch {
                return @{ ok=$false; error=$_.Exception.Message }
            }
        }
        'curator'     {
            switch ($Command) {
                'POLICY_DUMP' { return @{ ok=$true; policy=$CURATOR_POLICY; allow_high_risk=$ALLOW_HIGH_RISK } }
                default       { return @{ ok=$false; error="unknown curator command: $Command" } }
            }
        }
        'system'      {
            switch ($Command) {
                'LOG_CLEAR'   { $script:Log.Clear(); return @{ ok=$true; cleared=$true } }
                'LOG_COUNT'   { return @{ ok=$true; count=$script:Log.Count } }
                default       { return @{ ok=$false; error="unknown system command: $Command" } }
            }
        }
        default { return @{ ok=$false; error="unknown kind: $Kind" } }
    }
}

# ============================================================
# Notion Command Bus
# ============================================================
$script:NotionHeaders = @{
    'Authorization'  = "Bearer $NOTION_TOKEN"
    'Notion-Version' = $NOTION_API_VERSION
    'Content-Type'   = 'application/json'
}

function Get-NotionPropText {
    param($Property)
    if ($null -eq $Property) { return $null }
    if ($Property.title -and $Property.title.Count -gt 0)        { return ($Property.title       | ForEach-Object { $_.plain_text }) -join '' }
    if ($Property.rich_text -and $Property.rich_text.Count -gt 0){ return ($Property.rich_text   | ForEach-Object { $_.plain_text }) -join '' }
    if ($Property.select)                                        { return $Property.select.name }
    return $null
}

function Query-PendingCommands {
    $body = @{
        filter = @{ property = 'Status'; select = @{ equals = 'Pending' } }
        sorts  = @(@{ timestamp = 'created_time'; direction = 'ascending' })
        page_size = 10
    } | ConvertTo-Json -Depth 8

    $r = Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/$NOTION_DATABASE_ID/query" `
        -Method Post -Headers $script:NotionHeaders -Body $body
    return $r.results
}

function Update-CommandRow {
    param(
        [Parameter(Mandatory)][string]$PageId,
        [Parameter(Mandatory)][string]$Status,
        [string]$Result = $null,
        [switch]$SetExecutedAt
    )
    $props = @{ Status = @{ select = @{ name = $Status } } }
    if ($Result) {
        $truncated = if ($Result.Length -gt 1900) { $Result.Substring(0,1900) + ' ...[truncated]' } else { $Result }
        $props.Result = @{ rich_text = @(@{ text = @{ content = $truncated } }) }
    }
    if ($SetExecutedAt) {
        $props.'Executed At' = @{ date = @{ start = (Get-Date).ToString('o') } }
        $props.Executor      = @{ rich_text = @(@{ text = @{ content = "$($script:Hostname) / $VERSION" } }) }
    }
    $body = @{ properties = $props } | ConvertTo-Json -Depth 8
    Invoke-RestMethod -Uri "https://api.notion.com/v1/pages/$PageId" `
        -Method Patch -Headers $script:NotionHeaders -Body $body | Out-Null
}

function Tick-NotionPoller {
    try {
        $rows = Query-PendingCommands
        foreach ($row in $rows) {
            $pageId  = $row.id
            $command = Get-NotionPropText $row.properties.Command
            $kind    = Get-NotionPropText $row.properties.Kind
            $risk    = Get-NotionPropText $row.properties.Risk
            $argsRaw = Get-NotionPropText $row.properties.Args

            if ([string]::IsNullOrWhiteSpace($command)) {
                Update-CommandRow -PageId $pageId -Status 'Failed' -Result 'empty Command' -SetExecutedAt
                continue
            }
            if ([string]::IsNullOrWhiteSpace($kind)) { $kind = 'retroarch' }
            if ([string]::IsNullOrWhiteSpace($risk)) { $risk = 'low' }

            Update-CommandRow -PageId $pageId -Status 'Running'
            Add-LogEntry -Kind 'NOTION_CMD' -Message "$kind/$command" -Data @{ risk=$risk; args=$argsRaw }

            $result = $null
            try {
                $result = Invoke-BridgeCommand -Command $command -Kind $kind -Risk $risk -ArgsJson $argsRaw
                $json = $result | ConvertTo-Json -Depth 6 -Compress
                if ($result.blocked) {
                    Update-CommandRow -PageId $pageId -Status 'Blocked' -Result $json -SetExecutedAt
                } elseif ($result.ok) {
                    Update-CommandRow -PageId $pageId -Status 'Completed' -Result $json -SetExecutedAt
                } else {
                    Update-CommandRow -PageId $pageId -Status 'Failed' -Result $json -SetExecutedAt
                }
            } catch {
                Update-CommandRow -PageId $pageId -Status 'Failed' -Result $_.Exception.Message -SetExecutedAt
                Add-LogEntry -Kind 'ERROR' -Message $_.Exception.Message
            }
        }
    } catch {
        Add-LogEntry -Kind 'NOTION_ERR' -Message $_.Exception.Message
    }
}

# ============================================================
# HTML dashboard
# ============================================================
$DASHBOARD_HTML = @'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>AtomArcade Home Base</title>
<style>
 :root{color-scheme:dark}
 body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0d10;color:#e6e6e6;margin:0;padding:24px}
 h1{margin:0 0 8px;font-size:20px;letter-spacing:.5px}
 .sub{color:#7a8a99;font-size:12px;margin-bottom:24px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
 .card{background:#13171c;border:1px solid #1f262e;border-radius:8px;padding:16px}
 .card h2{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#9bb0c5}
 .kv{display:grid;grid-template-columns:160px 1fr;gap:4px 12px;font-size:13px}
 .kv div:nth-child(odd){color:#7a8a99}
 .ok{color:#7ee787}.bad{color:#f97583}.warn{color:#ffd866}
 button{background:#1f6feb;color:#fff;border:0;padding:6px 12px;border-radius:6px;font-family:inherit;cursor:pointer;margin:2px;font-size:12px}
 button:hover{background:#388bfd}button.danger{background:#a3261b}
 pre{background:#0b0d10;border:1px solid #1f262e;border-radius:6px;padding:10px;font-size:11px;max-height:300px;overflow:auto;margin:0}
 .log-entry{padding:2px 0;border-bottom:1px solid #1f262e}.log-kind{display:inline-block;width:110px;color:#9bb0c5}
 input[type=text]{background:#0b0d10;border:1px solid #1f262e;color:#e6e6e6;padding:6px 8px;border-radius:6px;font-family:inherit;width:60%}
</style></head><body>
<h1>HOME BASE</h1><div class="sub" id="sub">Booting...</div>
<div class="grid">
  <div class="card"><h2>Bridge status</h2><div class="kv" id="bridge-kv"></div></div>
  <div class="card"><h2>RetroArch</h2><div class="kv" id="ra-kv"></div>
    <div style="margin-top:12px">
      <button onclick="cmd('PAUSE_TOGGLE')">Pause/Resume</button>
      <button onclick="cmd('SAVE_STATE')">Save state</button>
      <button onclick="cmd('LOAD_STATE')">Load state</button>
      <button onclick="cmd('SCREENSHOT')">Screenshot</button>
      <button class="danger" onclick="if(confirm('Quit RetroArch?')) cmd('QUIT')">Quit</button>
    </div>
    <div style="margin-top:12px"><input id="raw-cmd" type="text" placeholder="raw command"/><button onclick="cmdRaw()">Send</button></div>
  </div>
  <div class="card" style="grid-column:span 2"><h2>Notion Command Bus</h2><div class="kv" id="bus-kv"></div></div>
  <div class="card" style="grid-column:span 2"><h2>Event log</h2><pre id="log"></pre></div>
</div>
<script>
async function j(u,o){const r=await fetch(u,o);return r.json()}
async function cmd(c){await j('/api/retroarch/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd:c})});refresh()}
async function cmdRaw(){const v=document.getElementById('raw-cmd').value.trim();if(!v)return;await cmd(v);document.getElementById('raw-cmd').value=''}
function kv(el,obj){el.innerHTML='';for(const[k,v]of Object.entries(obj)){const a=document.createElement('div');a.textContent=k;const b=document.createElement('div');if(v===true){b.textContent='yes';b.className='ok'}else if(v===false){b.textContent='no';b.className='bad'}else b.textContent=(v??'-');el.appendChild(a);el.appendChild(b)}}
async function refresh(){try{const s=await j('/api/status');document.getElementById('sub').textContent='Uptime: '+s.bridge.uptime_seconds+'s  v'+s.bridge.version+'  '+new Date().toLocaleTimeString();kv(document.getElementById('bridge-kv'),s.bridge);kv(document.getElementById('ra-kv'),s.retroarch);kv(document.getElementById('bus-kv'),s.notion_bus);const log=await j('/api/log');document.getElementById('log').innerHTML=log.slice(-40).reverse().map(e=>`<div class="log-entry"><span class="log-kind">${e.kind}</span>${new Date(e.ts).toLocaleTimeString()} -- ${e.message}</div>`).join('')}catch(e){document.getElementById('sub').textContent='Disconnected: '+e.message}}
refresh();setInterval(refresh,2000)
</script></body></html>
'@

# ============================================================
# HTTP server
# ============================================================
function Write-Json { param($Context, $Object, [int]$Status = 200)
    $json = $Object | ConvertTo-Json -Depth 8 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $Status
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}
function Write-Html { param($Context, [string]$Html)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Html)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = 'text/html; charset=utf-8'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}
function Read-JsonBody { param($Context)
    $reader = [System.IO.StreamReader]::new($Context.Request.InputStream, $Context.Request.ContentEncoding)
    $body = $reader.ReadToEnd(); $reader.Close()
    if ([string]::IsNullOrWhiteSpace($body)) { return @{} }
    return ($body | ConvertFrom-Json -AsHashtable)
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$HTTP_PORT/")
try { $listener.Start() } catch {
    Write-Error "Failed to bind http://localhost:$HTTP_PORT/. If access denied, run once as admin: netsh http add urlacl url=http://localhost:$HTTP_PORT/ user=$env:USERNAME"
    throw
}
Add-LogEntry -Kind 'BOOT' -Message "Home Base $VERSION listening on http://localhost:$HTTP_PORT/"
if ($NOTION_ENABLED) {
    Add-LogEntry -Kind 'BOOT' -Message "Notion Command Bus enabled (poll every ${NOTION_POLL_SECONDS}s)"
} else {
    Add-LogEntry -Kind 'BOOT' -Message 'Notion Command Bus DISABLED — set ATOMARCADE_NOTION_TOKEN and ATOMARCADE_NOTION_DB_ID env vars to enable.'
}
Write-Host ""; Write-Host "  Open: http://localhost:$HTTP_PORT/"; Write-Host "  Stop: Ctrl+C"; Write-Host ""

# --- Background runspace for Notion polling ---
$pollerJob = $null
if ($NOTION_ENABLED) {
    # We do the polling inline between HTTP requests using a timer pattern instead of a runspace,
    # to keep state shared and avoid concurrency on $script:Log.
    $script:LastNotionPoll = [datetime]::MinValue
}

try {
    while ($listener.IsListening) {
        # Cooperative poll: tick Notion if it's been > NOTION_POLL_SECONDS since last tick.
        if ($NOTION_ENABLED -and ((Get-Date) - $script:LastNotionPoll).TotalSeconds -ge $NOTION_POLL_SECONDS) {
            $script:LastNotionPoll = Get-Date
            Tick-NotionPoller
        }

        # Use BeginGetContext + WaitOne with timeout so we can interleave Notion polling.
        $asyncResult = $listener.BeginGetContext($null, $null)
        $signaled = $asyncResult.AsyncWaitHandle.WaitOne(1000)
        if (-not $signaled) { continue }
        $ctx = $listener.EndGetContext($asyncResult)

        $req = $ctx.Request; $path = $req.Url.AbsolutePath; $method = $req.HttpMethod
        try {
            switch -Regex ("$method $path") {
                '^GET /$' { Write-Html -Context $ctx -Html $DASHBOARD_HTML; break }
                '^GET /api/status$' {
                    $ping = Send-RetroArchCommand -Command 'GET_STATUS'
                    $ra = @{ reachable = $ping.ok; raw = $ping.reply; error = $ping.error }
                    if ($ping.reply) {
                        $parts = $ping.reply -split ' ', 4
                        if ($parts.Length -ge 3) { $ra.state = $parts[1]; $ra.system = $parts[2]; $ra.content = if ($parts.Length -ge 4) { $parts[3] } else { $null } }
                    }
                    $payload = @{
                        bridge = @{
                            ok=$true; version=$VERSION; uptime_seconds=[int]((Get-Date)-$script:Started).TotalSeconds
                            log_count=$script:Log.Count; hostname=$script:Hostname
                        }
                        retroarch = $ra
                        notion_bus = @{
                            enabled = $NOTION_ENABLED
                            poll_seconds = $NOTION_POLL_SECONDS
                            last_poll = if ($script:LastNotionPoll -eq [datetime]::MinValue) { 'never' } else { $script:LastNotionPoll.ToString('o') }
                            allow_high_risk = $ALLOW_HIGH_RISK
                            policy_kinds_enabled = ($CURATOR_POLICY.GetEnumerator() | Where-Object { $_.Value } | ForEach-Object { $_.Key }) -join ','
                        }
                    }
                    Write-Json -Context $ctx -Object $payload; break
                }
                '^GET /api/log$' { Write-Json -Context $ctx -Object $script:Log; break }
                '^POST /api/retroarch/command$' {
                    $body = Read-JsonBody -Context $ctx
                    $cmd = [string]$body.cmd
                    if ([string]::IsNullOrWhiteSpace($cmd)) { Write-Json -Context $ctx -Status 400 -Object @{ ok=$false; error='missing cmd' }; break }
                    $result = Send-RetroArchCommand -Command $cmd
                    Add-LogEntry -Kind 'RA_CMD' -Message $cmd -Data $result
                    Write-Json -Context $ctx -Object $result; break
                }
                '^GET /api/retroarch/ping$' {
                    $result = Send-RetroArchCommand -Command 'GET_STATUS'
                    Add-LogEntry -Kind 'RA_PING' -Message ($result.reply ?? '(no reply)') -Data $result
                    Write-Json -Context $ctx -Object $result; break
                }
                '^POST /api/notion/poll$' {
                    if (-not $NOTION_ENABLED) { Write-Json -Context $ctx -Status 409 -Object @{ ok=$false; error='Notion bus not configured' }; break }
                    Tick-NotionPoller
                    Write-Json -Context $ctx -Object @{ ok=$true; polled_at=(Get-Date).ToString('o') }; break
                }
                default { Write-Json -Context $ctx -Status 404 -Object @{ error='not found'; path=$path } }
            }
        } catch {
            Add-LogEntry -Kind 'ERROR' -Message $_.Exception.Message
            try { Write-Json -Context $ctx -Status 500 -Object @{ error = $_.Exception.Message } } catch {}
        }
    }
} finally {
    $listener.Stop(); $listener.Close()
    Add-LogEntry -Kind 'SHUTDOWN' -Message 'Home Base stopped'
}
