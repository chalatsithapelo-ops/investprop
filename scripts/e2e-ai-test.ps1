# E2E test for all 10 AI procedures shipped in commits a12ecb1 + c71f695.
# Target: https://investprop.io (production)
# Run:    powershell -ExecutionPolicy Bypass -File .\scripts\e2e-ai-test.ps1

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Web
$BASE  = "https://investprop.io"
$STAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$LOG   = "docs/E2E_AI_$STAMP.md"
$RESULTS = @()

function Log-Step {
    param([string]$Tier, [string]$Step, [string]$Status, [string]$Detail = "")
    $script:RESULTS += [PSCustomObject]@{ Tier=$Tier; Step=$Step; Status=$Status; Detail=$Detail; Time=(Get-Date -Format "HH:mm:ss") }
    $icon = if ($Status -eq "PASS") { "[OK]" } elseif ($Status -eq "FAIL") { "[FAIL]" } else { "[INFO]" }
    Write-Host "$icon [$Tier] $Step  $Detail"
}

function Invoke-Trpc {
    param([string]$Proc, [hashtable]$Payload, [string]$Method = "POST", [string]$Token = $null, [int]$TimeoutSec = 60)
    $url = "$BASE/trpc/$Proc"
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($Method -eq "POST") {
            $body = (@{ json = $Payload } | ConvertTo-Json -Depth 20 -Compress)
            $r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec $TimeoutSec
        } else {
            if ($Payload -and $Payload.Count -gt 0) {
                $inputJson = (@{ json = $Payload } | ConvertTo-Json -Depth 20 -Compress)
                $encoded = [System.Web.HttpUtility]::UrlEncode($inputJson)
                $r = Invoke-WebRequest -Uri "$($url)?input=$encoded" -Method GET -Headers $headers -UseBasicParsing -TimeoutSec $TimeoutSec
            } else {
                $r = Invoke-WebRequest -Uri $url -Method GET -Headers $headers -UseBasicParsing -TimeoutSec $TimeoutSec
            }
        }
        $obj = $r.Content | ConvertFrom-Json
        return @{ ok = $true; status = $r.StatusCode; data = $obj.result.data.json; raw = $r.Content }
    } catch {
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $errMsg = $_.Exception.Message; $errBody = ""
        try {
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                $errBody = $_.ErrorDetails.Message
                $errObj = $errBody | ConvertFrom-Json -ErrorAction SilentlyContinue
                $ext = $null
                if ($errObj.error.json.message) { $ext = $errObj.error.json.message }
                elseif ($errObj[0].error.json.message) { $ext = $errObj[0].error.json.message }
                if ($ext) { $errMsg = "HTTP ${statusCode}: $ext" }
                elseif ($errBody) { $errMsg = "HTTP ${statusCode}: $($errBody.Substring(0, [Math]::Min(200, $errBody.Length)))" }
            }
        } catch {}
        return @{ ok = $false; status = $statusCode; error = $errMsg; body = $errBody }
    }
}

Write-Host "`n=== Investprop AI E2E ($STAMP) ===`n"
$T = @{}

# ---------- LOGINS ----------
$adminPw = $env:INVESTPROP_ADMIN_PASSWORD
if (-not $adminPw) { Write-Host "[FATAL] Set `$env:INVESTPROP_ADMIN_PASSWORD before running this script." -ForegroundColor Red; exit 1 }
$r = Invoke-Trpc "login" @{ email="admin@investprop.io"; password=$adminPw }
if (-not $r.ok) { Log-Step "AUTH" "Admin login" "FAIL" $r.error; exit 1 }
$T.AdminToken = $r.data.accessToken; $T.AdminId = $r.data.user.id
Log-Step "AUTH" "Admin login" "PASS" "id=$($T.AdminId)"

$r = Invoke-Trpc "login" @{ email="investor@demo.com"; password="password123" }
if ($r.ok) { $T.InvToken = $r.data.accessToken; $T.InvId = $r.data.user.id; Log-Step "AUTH" "Investor login" "PASS" "id=$($T.InvId)" }
else { Log-Step "AUTH" "Investor login" "FAIL" $r.error }

$r = Invoke-Trpc "login" @{ email="devmanager@demo.com"; password="password123" }
if ($r.ok) { $T.DevToken = $r.data.accessToken; $T.DevId = $r.data.user.id; Log-Step "AUTH" "Dev-mgr login" "PASS" "id=$($T.DevId)" }
else { Log-Step "AUTH" "Dev-mgr login" "FAIL" $r.error }

$r = Invoke-Trpc "login" @{ email="owner@demo.com"; password="password123" }
if ($r.ok) { $T.OwnerToken = $r.data.accessToken; Log-Step "AUTH" "Owner/sponsor login" "PASS" }
else { Log-Step "AUTH" "Owner/sponsor login" "INFO" $r.error }

# ---------- Pick a property to test against ----------
$r = Invoke-Trpc "getInvestmentOpportunities" @{ authToken=$T.InvToken } "GET"
if (-not $r.ok -or -not $r.data) { Log-Step "SETUP" "Fetch opportunities" "FAIL" $r.error; exit 1 }
$opps = if ($r.data -is [array]) { $r.data } else { @($r.data) }
$T.PropId = [int]$opps[0].id
$T.PropIds = @($opps | Select-Object -First 3 | ForEach-Object { [int]$_.id })
Log-Step "SETUP" "Pick property" "PASS" "propertyId=$($T.PropId) (sample of $($T.PropIds.Count))"

# ============================================================
# TIER 1.1  Conversational Deal Co-Pilot
# ============================================================
$r = Invoke-Trpc "propertyChatHistory" @{ authToken=$T.InvToken; propertyId=$T.PropId } "GET"
if ($r.ok) { Log-Step "T1.1" "propertyChatHistory" "PASS" "msgs=$(@($r.data).Count)" } else { Log-Step "T1.1" "propertyChatHistory" "FAIL" $r.error }

$r = Invoke-Trpc "chatAboutProperty" @{ authToken=$T.InvToken; propertyId=$T.PropId; message="In one sentence: what is the expected return on this deal?" } "POST" -TimeoutSec:90
if ($r.ok) {
    $msgs = if ($r.data -is [array]) { $r.data } else { @($r.data) }
    $last = $msgs | Select-Object -Last 1
    Log-Step "T1.1" "chatAboutProperty (AI call)" "PASS" "reply len=$($last.content.Length) role=$($last.role)"
} else { Log-Step "T1.1" "chatAboutProperty (AI call)" "FAIL" $r.error }

# ============================================================
# TIER 1.2  Personalised Match Score
# ============================================================
$r = Invoke-Trpc "getMatchScore" @{ authToken=$T.InvToken; propertyId=$T.PropId } "GET" -TimeoutSec:60
if ($r.ok) { Log-Step "T1.2" "getMatchScore" "PASS" "score=$($r.data.score) band=$($r.data.band)" }
else { Log-Step "T1.2" "getMatchScore" "FAIL" $r.error }

$r = Invoke-Trpc "getMatchScoresBatch" @{ authToken=$T.InvToken; propertyIds=$T.PropIds } "GET" -TimeoutSec:90
if ($r.ok) { Log-Step "T1.2" "getMatchScoresBatch" "PASS" "results=$(@($r.data).Count)" }
else { Log-Step "T1.2" "getMatchScoresBatch" "FAIL" $r.error }

# ============================================================
# TIER 1.3  Doc Summary (need a legal doc on the chosen property)
# ============================================================
$r = Invoke-Trpc "getLegalDocuments" @{ authToken=$T.InvToken; propertyId=$T.PropId } "GET"
$docId = $null
if ($r.ok -and $r.data) {
    $docs = if ($r.data -is [array]) { $r.data } else { @($r.data) }
    if ($docs.Count -gt 0) { $docId = [int]$docs[0].id }
}
if ($docId) {
    $r = Invoke-Trpc "summariseLegalDocument" @{ authToken=$T.InvToken; documentId=$docId } "POST" -TimeoutSec:90
    if ($r.ok) { Log-Step "T1.3" "summariseLegalDocument" "PASS" "keyClauses=$(@($r.data.keyClauses).Count) glossary=$(@($r.data.glossary).Count)" }
    else { Log-Step "T1.3" "summariseLegalDocument" "FAIL" $r.error }

    $r = Invoke-Trpc "getLegalDocumentSummary" @{ authToken=$T.InvToken; documentId=$docId } "GET"
    if ($r.ok) { Log-Step "T1.3" "getLegalDocumentSummary" "PASS" "hasSummary=$([bool]$r.data.summary)" }
    else { Log-Step "T1.3" "getLegalDocumentSummary" "FAIL" $r.error }
} else { Log-Step "T1.3" "Doc summary" "INFO" "skipped - no legal document on property $($T.PropId)" }

# ============================================================
# TIER 1.4  Listing Coach (admin always allowed)
# ============================================================
$r = Invoke-Trpc "coachListing" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "POST" -TimeoutSec:90
if ($r.ok) { Log-Step "T1.4" "coachListing (admin)" "PASS" "score=$($r.data.score)" }
else { Log-Step "T1.4" "coachListing (admin)" "FAIL" $r.error }

$r = Invoke-Trpc "getListingCoachResult" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "GET"
if ($r.ok) { Log-Step "T1.4" "getListingCoachResult" "PASS" "hasResult=$([bool]$r.data)" }
else { Log-Step "T1.4" "getListingCoachResult" "FAIL" $r.error }

# ============================================================
# TIER 2.1  Independent Underwriting (admin/devmgr)
# ============================================================
$r = Invoke-Trpc "runUnderwriting" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "POST" -TimeoutSec:120
if ($r.ok) { Log-Step "T2.1" "runUnderwriting" "PASS" "rating=$($r.data.aiConfidenceRating) riskScore=$($r.data.aiRiskScore)" }
else { Log-Step "T2.1" "runUnderwriting" "FAIL" $r.error }

$r = Invoke-Trpc "getUnderwriting" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "GET"
if ($r.ok) { Log-Step "T2.1" "getUnderwriting" "PASS" "hasRating=$([bool]$r.data.aiConfidenceRating)" }
else { Log-Step "T2.1" "getUnderwriting" "FAIL" $r.error }

# Investor permission test - should be blocked
$r = Invoke-Trpc "runUnderwriting" @{ authToken=$T.InvToken; propertyId=$T.PropId } "POST"
if (-not $r.ok -and ($r.error -match "FORBIDDEN|permission|role")) {
    Log-Step "T2.1" "runUnderwriting blocks investor" "PASS" "blocked: $($r.error)"
} elseif ($r.ok) { Log-Step "T2.1" "runUnderwriting blocks investor" "FAIL" "investor was allowed!" }
else { Log-Step "T2.1" "runUnderwriting blocks investor" "INFO" $r.error }

# ============================================================
# TIER 2.2  Photo Check (admin/devmgr)
# ============================================================
# Use a single tiny public test image to validate the procedure wiring (vision will see a placeholder).
$photoPayload = @{
    authToken     = $T.AdminToken
    propertyId    = $T.PropId
    photoUrls     = @("https://placehold.co/600x400/png")
    expectedState = "Foundation slab poured and curing; perimeter rebar visible."
}
$r = Invoke-Trpc "verifyConstructionPhotos" $photoPayload "POST" -TimeoutSec:180
if ($r.ok) { Log-Step "T2.2" "verifyConstructionPhotos" "PASS" "verdict=$($r.data.verdict) confidence=$($r.data.confidence)" }
else { Log-Step "T2.2" "verifyConstructionPhotos" "FAIL" $r.error }

$r = Invoke-Trpc "getPhotoChecks" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "GET"
if ($r.ok) { Log-Step "T2.2" "getPhotoChecks" "PASS" "checks=$(@($r.data).Count)" }
else { Log-Step "T2.2" "getPhotoChecks" "FAIL" $r.error }

# ============================================================
# TIER 2.3  Portfolio Advisor (investor)
# ============================================================
$r = Invoke-Trpc "generatePortfolioInsight" @{ authToken=$T.InvToken } "POST" -TimeoutSec:90
if ($r.ok) { Log-Step "T2.3" "generatePortfolioInsight" "PASS" "insights=$(@($r.data.insights).Count) period=$($r.data.period)" }
elseif ($r.error -match "no.*contribution|no.*investment|portfolio.*empty") { Log-Step "T2.3" "generatePortfolioInsight" "INFO" "empty portfolio: $($r.error)" }
else { Log-Step "T2.3" "generatePortfolioInsight" "FAIL" $r.error }

$r = Invoke-Trpc "getPortfolioInsight" @{ authToken=$T.InvToken } "GET"
if ($r.ok) { Log-Step "T2.3" "getPortfolioInsight" "PASS" "hasInsight=$([bool]$r.data)" }
else { Log-Step "T2.3" "getPortfolioInsight" "FAIL" $r.error }

# ============================================================
# TIER 2.4  Investor Update Drafts (devmgr/admin)
# ============================================================
$r = Invoke-Trpc "listInvestorUpdates" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "GET"
if ($r.ok) { Log-Step "T2.4" "listInvestorUpdates" "PASS" "drafts=$(@($r.data).Count)" }
else { Log-Step "T2.4" "listInvestorUpdates" "FAIL" $r.error }

$r = Invoke-Trpc "generateInvestorUpdate" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "POST" -TimeoutSec:180
if ($r.ok) { Log-Step "T2.4" "generateInvestorUpdate" "PASS" "draftId=$($r.data.id) subjLen=$($r.data.subject.Length) status=$($r.data.status)" }
else { Log-Step "T2.4" "generateInvestorUpdate" "FAIL" $r.error }

# ============================================================
# TIER 3.1  Onboarding (any user)
# ============================================================
$r = Invoke-Trpc "startOnboardingSession" @{ authToken=$T.InvToken } "POST" -TimeoutSec:60
if ($r.ok) {
    Log-Step "T3.1" "startOnboardingSession" "PASS" "msgLen=$($r.data.message.Length) complete=$($r.data.complete)"
    $T.Greeting = $r.data.message

    $hist = @(@{ role="assistant"; content=$T.Greeting })
    $r2 = Invoke-Trpc "continueOnboardingSession" @{ authToken=$T.InvToken; history=$hist; userMessage="I have 5 years of property investment experience." } "POST" -TimeoutSec:60
    if ($r2.ok) { Log-Step "T3.1" "continueOnboardingSession" "PASS" "msgLen=$($r2.data.message.Length) complete=$($r2.data.complete)" }
    else { Log-Step "T3.1" "continueOnboardingSession" "FAIL" $r2.error }
} else { Log-Step "T3.1" "startOnboardingSession" "FAIL" $r.error }

# ============================================================
# TIER 3.2  Predictive Distress (admin/devmgr)
# ============================================================
$r = Invoke-Trpc "predictDistress" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "POST" -TimeoutSec:90
if ($r.ok) { Log-Step "T3.2" "predictDistress" "PASS" "score=$($r.data.score) band=$($r.data.band)" }
else { Log-Step "T3.2" "predictDistress" "FAIL" $r.error }

$r = Invoke-Trpc "getLatestDistress" @{ authToken=$T.AdminToken; propertyId=$T.PropId } "GET"
if ($r.ok) { Log-Step "T3.2" "getLatestDistress" "PASS" "hasResult=$([bool]$r.data)" }
else { Log-Step "T3.2" "getLatestDistress" "FAIL" $r.error }

$r = Invoke-Trpc "listDistressedPortfolio" @{ authToken=$T.AdminToken } "GET"
if ($r.ok) { Log-Step "T3.2" "listDistressedPortfolio" "PASS" "elevated=$(@($r.data).Count)" }
else { Log-Step "T3.2" "listDistressedPortfolio" "FAIL" $r.error }

# Investor blocked
$r = Invoke-Trpc "predictDistress" @{ authToken=$T.InvToken; propertyId=$T.PropId } "POST"
if (-not $r.ok -and ($r.error -match "FORBIDDEN|permission|role")) { Log-Step "T3.2" "predictDistress blocks investor" "PASS" "blocked" }
elseif ($r.ok) { Log-Step "T3.2" "predictDistress blocks investor" "FAIL" "investor allowed!" }
else { Log-Step "T3.2" "predictDistress blocks investor" "INFO" $r.error }

# ============================================================
# TIER 3.3  Sponsor Track Record
# ============================================================
$sponsorId = if ($T.DevId) { $T.DevId } elseif ($T.AdminId) { $T.AdminId } else { 1 }
$r = Invoke-Trpc "getSponsorTrackRecord" @{ authToken=$T.InvToken; sponsorUserId=$sponsorId } "GET" -TimeoutSec:90
if ($r.ok) { Log-Step "T3.3" "getSponsorTrackRecord" "PASS" "projects=$($r.data.stats.totalProjects) onTime=$($r.data.stats.onTimePct)%" }
else { Log-Step "T3.3" "getSponsorTrackRecord" "FAIL" $r.error }

# ============================================================
# Summary + markdown report
# ============================================================
$passes = ($RESULTS | Where-Object Status -eq "PASS").Count
$fails  = ($RESULTS | Where-Object Status -eq "FAIL").Count
$infos  = ($RESULTS | Where-Object Status -eq "INFO").Count

Write-Host "`n=========================================="
Write-Host "  RESULTS: $passes PASS, $fails FAIL, $infos INFO"
Write-Host "  Report: $LOG"
Write-Host "==========================================`n"

$issues = ($RESULTS | Where-Object Status -eq "FAIL" | ForEach-Object { "- **[$($_.Tier)] $($_.Step)** -- $($_.Detail)" }) -join "`n"
if (-not $issues) { $issues = "_No failures._" }
$tableRows = ($RESULTS | ForEach-Object { "| $($_.Time) | $($_.Tier) | $($_.Step) | $($_.Status) | $($_.Detail) |" }) -join "`n"

$md = @"
# AI Features E2E Run -- $STAMP

**Target:** $BASE
**Commits under test:** a12ecb1, c71f695

## Summary
- PASS: $passes
- FAIL: $fails
- INFO: $infos

## Issues
$issues

## Full Log
| Time | Tier | Step | Status | Detail |
|------|------|------|--------|--------|
$tableRows
"@
$md | Out-File -FilePath $LOG -Encoding utf8
Write-Host "Report written to $LOG"
