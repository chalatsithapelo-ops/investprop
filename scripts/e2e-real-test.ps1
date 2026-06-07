# Real End-to-End Test Runner against https://investprop.io
# Creates real test users, real data, real API calls. Logs every step.
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\e2e-real-test.ps1

$ErrorActionPreference = "Continue"
$BASE = "https://investprop.io"
$STAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$LOG = "docs/E2E_TEST_RUN_$STAMP.md"
$RESULTS = @()
$ISSUES = @()
$TestData = @{}

function Log-Step {
    param([string]$Persona, [string]$Step, [string]$Status, [string]$Detail = "")
    $entry = [PSCustomObject]@{
        Persona = $Persona
        Step    = $Step
        Status  = $Status
        Detail  = $Detail
        Time    = (Get-Date -Format "HH:mm:ss")
    }
    $script:RESULTS += $entry
    $icon = if ($Status -eq "PASS") { "[OK]" } elseif ($Status -eq "FAIL") { "[FAIL]" } else { "[INFO]" }
    Write-Host "$icon [$Persona] $Step  $Detail"
    if ($Status -eq "FAIL") {
        $script:ISSUES += "- **[$Persona] $Step** -- $Detail"
    }
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
            if ($Payload -and $Payload.Count -gt 0) {
                $inputJson = (@{ json = $Payload } | ConvertTo-Json -Depth 20 -Compress)
                $encoded = [System.Web.HttpUtility]::UrlEncode($inputJson)
                $r = Invoke-WebRequest -Uri "$($url)?input=$encoded" -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 30
            } else {
                $r = Invoke-WebRequest -Uri $url -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 30
            }
        }
        $obj = $r.Content | ConvertFrom-Json
        return @{ ok = $true; status = $r.StatusCode; data = $obj.result.data.json; raw = $r.Content }
    } catch {
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $errMsg = $_.Exception.Message
        $errBody = ""
        try {
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                $errBody = $_.ErrorDetails.Message
                $errObj = $errBody | ConvertFrom-Json -ErrorAction SilentlyContinue
                $extracted = $null
                if ($errObj.error.json.message) { $extracted = $errObj.error.json.message }
                elseif ($errObj[0].error.json.message) { $extracted = $errObj[0].error.json.message }
                elseif ($errObj.message) { $extracted = $errObj.message }
                if ($extracted) { $errMsg = $extracted }
            }
        } catch {}
        return @{ ok = $false; status = $statusCode; error = $errMsg; body = $errBody }
    }
}

Add-Type -AssemblyName System.Web

Write-Host "`n========================================="
Write-Host "  Investprop E2E Real-Data Test Run"
Write-Host "  Timestamp: $STAMP"
Write-Host "  Target:    $BASE"
Write-Host "=========================================`n"

# -------- PERSONA 0: ADMIN --------
Log-Step "ADMIN" "Login as platform admin" "INFO"
$adminPw = $env:INVESTPROP_ADMIN_PASSWORD
if (-not $adminPw) { Write-Host "[FATAL] Set `$env:INVESTPROP_ADMIN_PASSWORD before running this script." -ForegroundColor Red; exit 1 }
$r = Invoke-Trpc "login" @{ email = "admin@investprop.io"; password = $adminPw }
if ($r.ok -and $r.data.accessToken) {
    $TestData.AdminToken = $r.data.accessToken
    $TestData.AdminUser = $r.data.user
    Log-Step "ADMIN" "Login" "PASS" "role=$($r.data.user.role) id=$($r.data.user.id)"
} else {
    Log-Step "ADMIN" "Login" "FAIL" "$($r.error) :: $($r.body)"
}

# -------- PERSONA 1: SELLER --------
$sellerEmail = "seller-e2e-$STAMP@test.investprop.io"
$sellerPass = "TestPass2026"
Log-Step "SELLER" "Register as Property Owner" "INFO" $sellerEmail
$r = Invoke-Trpc "register" @{
    email = $sellerEmail; password = $sellerPass; name = "Sipho Test Seller"; role = "PROPERTY_OWNER"
}
if ($r.ok -and $r.data.accessToken) {
    $TestData.SellerToken = $r.data.accessToken
    $TestData.SellerUser = $r.data.user
    Log-Step "SELLER" "Register" "PASS" "id=$($r.data.user.id) status=$($r.data.user.status)"
} else {
    Log-Step "SELLER" "Register" "FAIL" "$($r.error) :: $($r.body)"
}

if ($TestData.SellerToken) {
    Log-Step "SELLER" "Submit sale proposal (Joint Venture)" "INFO"
    $r = Invoke-Trpc "submitSaleProposal" @{
        authToken         = $TestData.SellerToken
        title             = "3-Bedroom Townhouse in Sandton (E2E test)"
        description       = "Modern 3-bed townhouse with garden, double garage, in secure complex. Posted via automated E2E test."
        address           = "12 Test Crescent, Morningside Manor"
        city              = "Sandton"
        province          = "Gauteng"
        propertyType      = "Townhouse"
        askingPrice       = 2500000
        marketValue       = 2700000
        urgencyLevel      = "HIGH"
        saleType          = "CASH"
        engagementType    = "JOINT_VENTURE"
        reason            = "Relocating overseas, looking for partnership"
        bedrooms          = 3
        bathrooms         = 2
        squareMeters      = 145
        erfSize           = 320
        titleDeedNumber   = "T54321/2019"
        erfNumber         = "Erf 1234, Morningside Manor Ext 5"
        bondStatus        = "EXISTING"
        bondOutstanding   = 850000
        bondBank          = "Standard Bank"
        ratesStatus       = "CURRENT"
        tenancyStatus     = "OWNER_OCCUPIED"
        conditionRating   = "GOOD"
        estimatedRenoCost = 50000
        popiaConsent      = $true
        contactPhone      = "+27 82 555 0001"
        contactEmail      = $sellerEmail
        imageUrls         = @()
        documentUrls      = @()
    }
    if ($r.ok -and $r.data.proposal) {
        $TestData.ProposalId = $r.data.proposal.id
        Log-Step "SELLER" "Submit proposal" "PASS" "id=$($r.data.proposal.id) engagement=$($r.data.proposal.engagementType)"
    } else {
        Log-Step "SELLER" "Submit proposal" "FAIL" "$($r.error) :: $($r.body)"
    }

    Log-Step "SELLER" "View my proposals" "INFO"
    $r = Invoke-Trpc "getMySaleProposals" @{ authToken = $TestData.SellerToken } "GET"
    if ($r.ok) {
        $count = if ($r.data -is [array]) { $r.data.Count } else { ($r.data | Measure-Object).Count }
        Log-Step "SELLER" "List my proposals" "PASS" "count=$count"
    } else {
        Log-Step "SELLER" "List my proposals" "FAIL" "$($r.error)"
    }
}

# -------- PERSONA 2: DEV MANAGER (uses admin since ADMIN has super-role) --------
if ($TestData.AdminToken -and $TestData.ProposalId) {
    Log-Step "DEV_MGR" "View incoming sale proposals" "INFO"
    $r = Invoke-Trpc "getSaleProposals" @{ authToken = $TestData.AdminToken } "GET"
    if ($r.ok) {
        $proposals = if ($r.data.proposals) { $r.data.proposals } else { @() }
        Log-Step "DEV_MGR" "List sale proposals" "PASS" "count=$($proposals.Count)"
    } else {
        Log-Step "DEV_MGR" "List sale proposals" "FAIL" "$($r.error)"
    }

    Log-Step "DEV_MGR" "Mark proposal UNDER_REVIEW" "INFO"
    $r = Invoke-Trpc "reviewSaleProposal" @{
        authToken = $TestData.AdminToken; proposalId = $TestData.ProposalId; action = "UNDER_REVIEW"
        reviewNotes = "E2E test: opening for review"
    }
    if ($r.ok) { Log-Step "DEV_MGR" "Mark UNDER_REVIEW" "PASS" }
    else { Log-Step "DEV_MGR" "Mark UNDER_REVIEW" "FAIL" "$($r.error)" }

    Log-Step "DEV_MGR" "Issue counter-offer R 2.2M" "INFO"
    $r = Invoke-Trpc "counterOfferSaleProposal" @{
        authToken = $TestData.AdminToken; proposalId = $TestData.ProposalId
        counterOfferAmount = 2200000; counterOfferTerms = "Subject to title verification + 30 day cooling off. JV 60/40 split."
    }
    if ($r.ok) { Log-Step "DEV_MGR" "Counter-offer" "PASS" "amount=R2200000" }
    else { Log-Step "DEV_MGR" "Counter-offer" "FAIL" "$($r.error) :: $($r.body)" }
}

# -------- Seller responds to counter --------
if ($TestData.SellerToken -and $TestData.ProposalId) {
    Log-Step "SELLER" "Accept counter-offer" "INFO"
    $r = Invoke-Trpc "respondToCounterOffer" @{
        authToken = $TestData.SellerToken; proposalId = $TestData.ProposalId; action = "ACCEPT"
    }
    if ($r.ok) { Log-Step "SELLER" "Accept counter" "PASS" }
    else { Log-Step "SELLER" "Accept counter" "FAIL" "$($r.error) :: $($r.body)" }
}

# -------- PERSONA 3: CONTRACTOR --------
$ctrEmail = "contractor-e2e-$STAMP@test.investprop.io"
Log-Step "CONTRACTOR" "Register as contractor" "INFO" $ctrEmail
$r = Invoke-Trpc "register" @{
    email = $ctrEmail; password = $sellerPass; name = "Acme Builders (Pty) Ltd"; role = "CONTRACTOR"
}
if ($r.ok -and $r.data.accessToken) {
    $TestData.CtrToken = $r.data.accessToken
    $TestData.CtrUser = $r.data.user
    Log-Step "CONTRACTOR" "Register" "PASS" "id=$($r.data.user.id) status=$($r.data.user.status)"
} else {
    Log-Step "CONTRACTOR" "Register" "FAIL" "$($r.error) :: $($r.body)"
}

if ($TestData.CtrToken) {
    Log-Step "CONTRACTOR" "Create company profile (CIDB/BBBEE/PL insurance)" "INFO"
    $r = Invoke-Trpc "submitContractorSelfProfile" @{
        authToken          = $TestData.CtrToken
        companyName        = "Acme Builders (Pty) Ltd"
        tradingAs          = "Acme Construction"
        registrationNumber = "2018/123456/07"
        vatNumber          = "4012345678"
        beeLevel           = "Level 2"
        cidbGrade          = "6GB"
        specialty          = "Residential & Renovation"
        phone              = "+27 11 555 0123"
        address            = "45 Industrial Rd, Wynberg"
        city               = "Sandton"
        province           = "Gauteng"
        bankName           = "FNB"
        bankAccountNumber  = "62123456789"
        bankBranchCode     = "250655"
    }
    if ($r.ok) { Log-Step "CONTRACTOR" "Profile created" "PASS" "id=$($r.data.id) status=$($r.data.profileStatus)" }
    else { Log-Step "CONTRACTOR" "Profile create" "FAIL" "$($r.error) :: $($r.body)" }
}

# -------- PERSONA 4: INVESTOR --------
$invEmail = "investor-e2e-$STAMP@test.investprop.io"
Log-Step "INVESTOR" "Register as investor" "INFO" $invEmail
$r = Invoke-Trpc "register" @{
    email = $invEmail; password = $sellerPass; name = "Thandi Test Investor"; role = "INVESTOR"
}
if ($r.ok -and $r.data.accessToken) {
    $TestData.InvToken = $r.data.accessToken
    $TestData.InvUser = $r.data.user
    Log-Step "INVESTOR" "Register" "PASS" "id=$($r.data.user.id) status=$($r.data.user.status) verified=$($r.data.user.emailVerified)"
} else {
    Log-Step "INVESTOR" "Register" "FAIL" "$($r.error) :: $($r.body)"
}

if ($TestData.InvToken) {
    Log-Step "INVESTOR" "View investment opportunities" "INFO"
    $r = Invoke-Trpc "getInvestmentOpportunities" @{ authToken = $TestData.InvToken } "GET"
    if ($r.ok) {
        $opps = if ($r.data -is [array]) { $r.data } else { @($r.data) }
        Log-Step "INVESTOR" "List opportunities" "PASS" "count=$($opps.Count)"
        if ($opps.Count -gt 0) { $TestData.OpportunityId = $opps[0].id }
    } else {
        Log-Step "INVESTOR" "List opportunities" "FAIL" "$($r.error)"
    }

    Log-Step "INVESTOR" "Try to submit proposal BEFORE verifying email (should be blocked)" "INFO"
    if ($TestData.OpportunityId) {
        $r = Invoke-Trpc "submitInvestmentProposal" @{
            authToken = $TestData.InvToken; propertyId = $TestData.OpportunityId; amount = 5000
        }
        if (-not $r.ok -and ($r.error -like "*verify*" -or $r.error -like "*email*" -or $r.body -like "*verify*")) {
            Log-Step "INVESTOR" "Email-verify gate" "PASS" "correctly blocked: $($r.error)"
        } elseif ($r.ok) {
            Log-Step "INVESTOR" "Email-verify gate" "FAIL" "INVEST WAS ALLOWED WITHOUT VERIFIED EMAIL"
        } else {
            Log-Step "INVESTOR" "Email-verify gate" "INFO" "blocked but reason unclear: $($r.error)"
        }
    } else {
        Log-Step "INVESTOR" "Email-verify gate test" "INFO" "skipped (no opportunity)"
    }

    Log-Step "INVESTOR" "Try R 100 investment (below R1000 floor)" "INFO"
    if ($TestData.OpportunityId) {
        $r = Invoke-Trpc "submitInvestmentProposal" @{
            authToken = $TestData.InvToken; propertyId = $TestData.OpportunityId; amount = 100
        }
        if (-not $r.ok -and ($r.error -like "*1000*" -or $r.error -like "*minimum*" -or $r.body -like "*minimum*")) {
            Log-Step "INVESTOR" "R1000 minimum enforced" "PASS" $r.error
        } elseif ($r.ok) {
            Log-Step "INVESTOR" "R1000 minimum" "FAIL" "minimum was NOT enforced"
        } else {
            Log-Step "INVESTOR" "R1000 minimum" "INFO" "blocked (possibly by email gate first): $($r.error)"
        }
    }

    Log-Step "INVESTOR" "Get my contributions" "INFO"
    $r = Invoke-Trpc "getMyContributions" @{ authToken = $TestData.InvToken } "GET"
    if ($r.ok) {
        $c = if ($r.data -is [array]) { $r.data.Count } else { 0 }
        Log-Step "INVESTOR" "My contributions" "PASS" "count=$c"
    } else {
        Log-Step "INVESTOR" "My contributions" "FAIL" "$($r.error)"
    }
}

# -------- PERSONA 5: ADMIN follow-up checks --------
if ($TestData.AdminToken) {
    Log-Step "ADMIN" "List all users" "INFO"
    $r = Invoke-Trpc "getAllUsers" @{ role = "ALL"; page = 1; limit = 100 } "GET" $TestData.AdminToken
    if ($r.ok) {
        $u = if ($r.data -is [array]) { $r.data.Count } else { 0 }
        Log-Step "ADMIN" "User list" "PASS" "total=$u"
    } else {
        Log-Step "ADMIN" "User list" "FAIL" "$($r.error)"
    }

    Log-Step "ADMIN" "Query audit log (last 50)" "INFO"
    $r = Invoke-Trpc "listAuditLog" @{ authToken = $TestData.AdminToken; limit = 50 } "GET"
    if ($r.ok) {
        $rows = $r.data.rows
        $count = if ($rows) { @($rows).Count } else { 0 }
        Log-Step "ADMIN" "Audit log" "PASS" "entries=$count first=$($rows[0].action)"
    } else {
        Log-Step "ADMIN" "Audit log" "FAIL" "$($r.error) :: $($r.body)"
    }

    Log-Step "ADMIN" "Get system stats" "INFO"
    # getSystemStats is adminProcedure (uses ctx) - call with auth header, empty input
    $r = Invoke-Trpc "getSystemStats" @{} "GET" $TestData.AdminToken
    if ($r.ok) {
        Log-Step "ADMIN" "System stats" "PASS" "users=$($r.data.totalUsers) properties=$($r.data.totalProperties) invested=$($r.data.totalInvested._sum.contributionAmount)"
    } else {
        Log-Step "ADMIN" "System stats" "FAIL" "$($r.error)"
    }
}

# -------- Public page reachability --------
$publicPages = @(
    "/", "/sell-your-property", "/login", "/register", "/forgot-password"
)
foreach ($p in $publicPages) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE$p" -UseBasicParsing -TimeoutSec 15
        Log-Step "PUBLIC" "GET $p" "PASS" "HTTP $($r.StatusCode)"
    } catch {
        Log-Step "PUBLIC" "GET $p" "FAIL" $_.Exception.Message
    }
}

# -------- WRITE MARKDOWN REPORT --------
$passes  = ($RESULTS | Where-Object Status -eq "PASS").Count
$fails   = ($RESULTS | Where-Object Status -eq "FAIL").Count
$infos   = ($RESULTS | Where-Object Status -eq "INFO").Count

$md = @"
# E2E Real-Data Test Run -- $STAMP

**Target:** $BASE
**Started:** $STAMP

## Summary
- PASS: $passes
- FAIL: $fails
- INFO: $infos

## Test Data Created
| Key | Value |
|-----|-------|
| Seller email | $sellerEmail |
| Seller user id | $($TestData.SellerUser.id) |
| Contractor email | $ctrEmail |
| Contractor user id | $($TestData.CtrUser.id) |
| Investor email | $invEmail |
| Investor user id | $($TestData.InvUser.id) |
| Sale Proposal id | $($TestData.ProposalId) |

## Issues Found
"@
if ($ISSUES.Count -eq 0) {
    $md += "`n_No failures detected._`n"
} else {
    $md += "`n" + ($ISSUES -join "`n") + "`n"
}

$md += "`n## Full Step Log`n`n| Time | Persona | Step | Status | Detail |`n|------|---------|------|--------|--------|`n"
foreach ($r in $RESULTS) {
    $md += "| $($r.Time) | $($r.Persona) | $($r.Step) | $($r.Status) | $($r.Detail -replace '\|','\|') |`n"
}

$md | Out-File -FilePath $LOG -Encoding utf8
Write-Host "`n========================================="
Write-Host "  RESULTS: $passes PASS, $fails FAIL, $infos INFO"
Write-Host "  Report:  $LOG"
Write-Host "========================================="
