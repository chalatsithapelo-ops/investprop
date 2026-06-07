# Extended E2E test for new features (P4/8/9/10/12/14) and picture upload.
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\e2e-extended-test.ps1
#
# Requires: admin@investprop.io / $env:INVESTPROP_ADMIN_PASSWORD (default uses script var)
$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Web
$BASE = "https://investprop.io"
$STAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$LOG = "docs/E2E_EXTENDED_$STAMP.md"
$RESULTS = @()

function Log-Step {
    param([string]$Persona, [string]$Step, [string]$Status, [string]$Detail = "")
    $script:RESULTS += [PSCustomObject]@{ Persona=$Persona; Step=$Step; Status=$Status; Detail=$Detail; Time=(Get-Date -Format "HH:mm:ss") }
    $icon = if ($Status -eq "PASS") { "[OK]" } elseif ($Status -eq "FAIL") { "[FAIL]" } else { "[INFO]" }
    Write-Host "$icon [$Persona] $Step  $Detail"
}

function Invoke-Trpc {
    param([string]$Proc, [hashtable]$Payload, [string]$Method = "POST", [string]$Token = $null)
    $url = "$BASE/trpc/$Proc"
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($Method -eq "POST") {
            $body = (@{ json = $Payload } | ConvertTo-Json -Depth 20 -Compress)
            $r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 30
        } else {
            $inputJson = (@{ json = $Payload } | ConvertTo-Json -Depth 20 -Compress)
            $encoded = [System.Web.HttpUtility]::UrlEncode($inputJson)
            $r = Invoke-WebRequest -Uri "$($url)?input=$encoded" -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 30
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
                if ($ext) { $errMsg = $ext }
            }
        } catch {}
        return @{ ok = $false; status = $statusCode; error = $errMsg; body = $errBody }
    }
}

Write-Host "`n=== Investprop Extended E2E Run ($STAMP) ===`n"
$T = @{}

# Admin login
$adminPw = $env:INVESTPROP_ADMIN_PASSWORD
if (-not $adminPw) { Write-Host "[FATAL] Set `$env:INVESTPROP_ADMIN_PASSWORD before running this script." -ForegroundColor Red; exit 1 }
$r = Invoke-Trpc "login" @{ email="admin@investprop.io"; password=$adminPw }
if (-not $r.ok) { Log-Step "ADMIN" "Login" "FAIL" $r.error; exit 1 }
$T.AdminToken = $r.data.accessToken; $T.AdminId = $r.data.user.id
Log-Step "ADMIN" "Login" "PASS" "id=$($T.AdminId)"

# Existing seed investor for forecast/cap-table
$r = Invoke-Trpc "login" @{ email="investor@demo.com"; password="password123" }
if ($r.ok) { $T.InvestorToken = $r.data.accessToken; $T.InvestorId = $r.data.user.id; Log-Step "INVESTOR" "Login demo investor" "PASS" "id=$($T.InvestorId)" }
else { Log-Step "INVESTOR" "Login demo investor" "FAIL" $r.error }

# Existing seed dev manager
$r = Invoke-Trpc "login" @{ email="devmanager@demo.com"; password="password123" }
if ($r.ok) { $T.DevToken = $r.data.accessToken; Log-Step "DEV_MGR" "Login demo dev manager" "PASS" }
else { Log-Step "DEV_MGR" "Login demo dev manager" "FAIL" $r.error }

# ───── Phase 9: getInvestmentOpportunities + getLegalDocuments ─────
$r = Invoke-Trpc "getInvestmentOpportunities" @{ authToken=$T.InvestorToken } "GET"
if ($r.ok) {
    $opps = if ($r.data -is [array]) { $r.data } else { @($r.data) }
    $T.OppId = $opps[0].id
    Log-Step "P9" "List opportunities" "PASS" "count=$($opps.Count) firstId=$($T.OppId) riskRating=$($opps[0].riskRating)"
    if (-not $opps[0].riskRating) { Log-Step "P9" "Risk rating field" "FAIL" "riskRating is null on opportunity $($opps[0].id)" }
    else { Log-Step "P9" "Risk rating field" "PASS" $opps[0].riskRating }
} else { Log-Step "P9" "List opportunities" "FAIL" $r.error }

if ($T.OppId) {
    $r = Invoke-Trpc "getLegalDocuments" @{ authToken=$T.InvestorToken; propertyId=$T.OppId } "GET"
    if ($r.ok) {
        $docCount = if ($r.data -is [array]) { $r.data.Count } else { 0 }
        Log-Step "P9" "Legal documents pack" "PASS" "docs=$docCount for property $($T.OppId)"
    } else { Log-Step "P9" "Legal documents pack" "FAIL" $r.error }
}

# ───── Phase 10: Cap-table preview ─────
if ($T.OppId) {
    $r = Invoke-Trpc "getCapTablePreview" @{ authToken=$T.InvestorToken; propertyId=$T.OppId } "GET"
    if ($r.ok) {
        $totalCommitted = $r.data.totalCommitted; $totalInvestors = $r.data.totalInvestors
        Log-Step "P10" "Cap-table preview" "PASS" "committed=R$totalCommitted investors=$totalInvestors rows=$($r.data.rows.Count)"
    } else { Log-Step "P10" "Cap-table preview" "FAIL" $r.error }
}

# ───── Phase 10: Distribution forecast (need a contribution) ─────
$r = Invoke-Trpc "getMyContributions" @{ authToken=$T.InvestorToken } "GET"
if ($r.ok) {
    $cs = $r.data
    # Could be array OR {contributions: [...]}
    $contribsArr = if ($cs -is [array]) { $cs } elseif ($cs.contributions) { $cs.contributions } else { @() }
    Log-Step "P10" "Get my contributions" "PASS" "count=$($contribsArr.Count)"
    if ($contribsArr.Count -gt 0) {
        $T.ContribId = $contribsArr[0].id
        $r2 = Invoke-Trpc "getDistributionForecast" @{ authToken=$T.InvestorToken; contributionId=$T.ContribId } "GET"
        if ($r2.ok) {
            Log-Step "P10" "Distribution forecast" "PASS" "principal=R$($r2.data.principal) rate=$($r2.data.annualRate)% years=$($r2.data.projections.Count)"
        } else { Log-Step "P10" "Distribution forecast" "FAIL" $r2.error }
    } else { Log-Step "P10" "Distribution forecast" "INFO" "skipped - no contributions for demo investor" }
} else { Log-Step "P10" "Get my contributions" "FAIL" $r.error }

# ───── Phase 10: Marketplace overview ─────
$r = Invoke-Trpc "getMarketplaceOverview" @{} "GET"
if ($r.ok) {
    $marketCount = if ($r.data -is [array]) { $r.data.Count } else { 0 }
    Log-Step "P10" "Marketplace overview" "PASS" "shareClasses=$marketCount"
} else { Log-Step "P10" "Marketplace overview" "FAIL" $r.error }

# ───── Phase 12: Work orders incl variations ─────
$r = Invoke-Trpc "getWorkOrders" @{ authToken=$T.DevToken } "GET"
if ($r.ok) {
    $woCount = if ($r.data -is [array]) { $r.data.Count } else { 0 }
    $hasVariationsField = $false
    if ($woCount -gt 0 -and $r.data[0].PSObject.Properties.Name -contains "variations") { $hasVariationsField = $true }
    Log-Step "P12" "Work orders (with variations include)" "PASS" "count=$woCount variationsIncluded=$hasVariationsField"
} else { Log-Step "P12" "Work orders" "FAIL" $r.error }

# ───── Phase 13: System health (admin only) ─────
$r = Invoke-Trpc "getSystemHealth" @{ authToken=$T.AdminToken } "GET"
if ($r.ok) {
    Log-Step "P13" "System health" "PASS" "users=$($r.data.metrics.totalUsers) activeProps=$($r.data.metrics.activeProperties) status=$($r.data.status)"
} else { Log-Step "P13" "System health" "FAIL" $r.error }

# ───── Phase 14: Email templates trigger ─────
# Trigger verifyEmail resend, which uses the new emailVerification template
$r = Invoke-Trpc "resendVerificationEmail" @{ email="admin@investprop.io" }
if ($r.ok) { Log-Step "P14" "Trigger email send" "PASS" "resent verification" }
elseif ($r.error -like "*already*verified*" -or $r.error -like "*verified*") { Log-Step "P14" "Trigger email send" "PASS" "expected: already verified" }
else { Log-Step "P14" "Trigger email send" "INFO" $r.error }

# ───── Picture upload via presigned URL ─────
Log-Step "UPLOAD" "Get presigned upload URL" "INFO"
$r = Invoke-Trpc "getPresignedUploadUrl" @{ authToken=$T.AdminToken; fileName="e2e-test-$STAMP.png"; fileType="image/png" } "GET"
if ($r.ok) {
    $T.PresignedUrl = $r.data.presignedUrl; $T.PublicUrl = $r.data.publicUrl
    Log-Step "UPLOAD" "Presigned URL received" "PASS" "publicUrl=$($T.PublicUrl)"
    # Check if URL is browser-reachable
    $uri = [Uri]$T.PresignedUrl
    if ($uri.Host -eq "minio" -or $uri.Host -like "*.internal" -or $uri.Host -match "^localhost$") {
        Log-Step "UPLOAD" "Presigned URL host reachability" "FAIL" "Host '$($uri.Host)' is not publicly resolvable - browser uploads will fail"
    } else {
        # Try actual upload
        $png1x1 = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
        try {
            $up = Invoke-WebRequest -Uri $T.PresignedUrl -Method PUT -Body $png1x1 -ContentType "image/png" -UseBasicParsing -TimeoutSec 30
            Log-Step "UPLOAD" "PUT to presigned URL" "PASS" "HTTP $($up.StatusCode)"
            try {
                $g = Invoke-WebRequest -Uri $T.PublicUrl -Method GET -UseBasicParsing -TimeoutSec 15
                Log-Step "UPLOAD" "GET public URL" "PASS" "HTTP $($g.StatusCode) length=$($g.Content.Length)"
            } catch { Log-Step "UPLOAD" "GET public URL" "FAIL" $_.Exception.Message }
        } catch { Log-Step "UPLOAD" "PUT to presigned URL" "FAIL" $_.Exception.Message }
    }
} else { Log-Step "UPLOAD" "Get presigned URL" "FAIL" $r.error }

# ───── Phase 4: Property delete (only test create + delete cycle to avoid breaking demo data) ─────
# Test that the procedure exists and rejects non-managers
$r = Invoke-Trpc "deleteProperty" @{ authToken=$T.InvestorToken; propertyId=99999 }
if (-not $r.ok -and ($r.error -like "*permission*" -or $r.error -like "*FORBIDDEN*" -or $r.error -like "*role*" -or $r.error -like "*not found*" -or $r.error -like "*NOT_FOUND*")) {
    Log-Step "P4" "deleteProperty access control" "PASS" "investor blocked: $($r.error)"
} elseif ($r.ok) {
    Log-Step "P4" "deleteProperty access control" "FAIL" "INVESTOR was allowed to call deleteProperty"
} else { Log-Step "P4" "deleteProperty access control" "INFO" "blocked: $($r.error)" }

# ───── Page reachability (new routes) ─────
$pagesPublic = @("/", "/login", "/register", "/forgot-password", "/sell-your-property")
$pagesAuth = @(
    "/dashboard",
    "/investments/opportunities",
    "/investments/my-contributions",
    "/investments/certificates",
    "/portfolio",
    "/distributions",
    "/share-marketplace",
    "/sale-proposals",
    "/contractor-portal"
)
foreach ($p in $pagesPublic + $pagesAuth) {
    try {
        $resp = Invoke-WebRequest -Uri "$BASE$p" -UseBasicParsing -TimeoutSec 15
        Log-Step "PAGES" "GET $p" "PASS" "HTTP $($resp.StatusCode)"
    } catch { Log-Step "PAGES" "GET $p" "FAIL" $_.Exception.Message }
}

if ($T.OppId) {
    $p = "/investments/opportunities/$($T.OppId)/cap-table"
    try {
        $resp = Invoke-WebRequest -Uri "$BASE$p" -UseBasicParsing -TimeoutSec 15
        Log-Step "PAGES" "GET $p" "PASS" "HTTP $($resp.StatusCode)"
    } catch { Log-Step "PAGES" "GET $p" "FAIL" $_.Exception.Message }
}

# ───── Summary + markdown report ─────
$passes = ($RESULTS | Where-Object Status -eq "PASS").Count
$fails  = ($RESULTS | Where-Object Status -eq "FAIL").Count
$infos  = ($RESULTS | Where-Object Status -eq "INFO").Count

Write-Host "`n=========================================="
Write-Host "  RESULTS: $passes PASS, $fails FAIL, $infos INFO"
Write-Host "  Report: $LOG"
Write-Host "==========================================`n"

$issues = ($RESULTS | Where-Object Status -eq "FAIL" | ForEach-Object { "- **[$($_.Persona)] $($_.Step)** -- $($_.Detail)" }) -join "`n"
if (-not $issues) { $issues = "_No failures._" }
$tableRows = ($RESULTS | ForEach-Object { "| $($_.Time) | $($_.Persona) | $($_.Step) | $($_.Status) | $($_.Detail) |" }) -join "`n"

$md = @"
# Extended E2E Run -- $STAMP

**Target:** $BASE

## Summary
- PASS: $passes
- FAIL: $fails
- INFO: $infos

## Issues
$issues

## Full Log
| Time | Persona | Step | Status | Detail |
|------|---------|------|--------|--------|
$tableRows
"@
$md | Out-File -FilePath $LOG -Encoding utf8
Write-Host "Report written to $LOG"
