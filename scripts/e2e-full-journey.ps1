# ==========================================================================
#  Investprop - FULL MULTI-PERSONA END-TO-END JOURNEY
#  Drives the live production tRPC API with the demo accounts, exercising
#  every major process: dev-manager creates all property types, takes them
#  through SPV / publish / share-class, investors do appropriateness + KYC +
#  invest + proof-of-payment + funding, manager runs distributions, the
#  secondary market (sell + wallet-funded buy) settles, and the owner takes
#  a sale proposal end-to-end to a promoted property.
#
#  Run:  powershell -ExecutionPolicy Bypass -File .\scripts\e2e-full-journey.ps1
# ==========================================================================

$ErrorActionPreference = "Continue"
$BASE   = "https://investprop.io"
$STAMP  = Get-Date -Format "yyyyMMdd-HHmmss"
$LOG    = "docs/E2E_FULL_JOURNEY_$STAMP.md"
$PW     = "password123"
$RESULTS = @()
$ISSUES  = @()
$NOTES   = @()
$T = @{}            # tokens / users
$PROPS = @{}        # property map (script scope)

Add-Type -AssemblyName System.Web

# ---- SSH / DB (for crediting a demo wallet on the buy leg) ----
$SSH     = "$env:SystemRoot\System32\OpenSSH\ssh.exe"
$SSHKEY  = "$HOME\.ssh\investprop_ed25519"
$SSHHOST = "root@178.105.120.112"

function Log-Step {
    param([string]$Persona, [string]$Step, [string]$Status, [string]$Detail = "")
    $entry = [PSCustomObject]@{
        Persona = $Persona; Step = $Step; Status = $Status
        Detail = $Detail; Time = (Get-Date -Format "HH:mm:ss")
    }
    $script:RESULTS += $entry
    $icon = switch ($Status) { "PASS" {"[OK]"} "FAIL" {"[FAIL]"} "WARN" {"[WARN]"} default {"[INFO]"} }
    Write-Host "$icon [$Persona] $Step  $Detail"
    if ($Status -eq "FAIL") { $script:ISSUES += "- **[$Persona] $Step** -- $Detail" }
}

function Note { param([string]$Text) $script:NOTES += $Text; Write-Host "    > $Text" -ForegroundColor DarkGray }

function Invoke-Trpc {
    param([string]$Proc, [hashtable]$Payload, [string]$Method = "POST")
    $url = "$BASE/trpc/$Proc"
    $headers = @{ "Content-Type" = "application/json" }
    try {
        if ($Method -eq "POST") {
            $body = (@{ json = $Payload } | ConvertTo-Json -Depth 30 -Compress)
            $r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 40
        } else {
            if ($Payload -and $Payload.Count -gt 0) {
                $inputJson = (@{ json = $Payload } | ConvertTo-Json -Depth 30 -Compress)
                $encoded = [System.Web.HttpUtility]::UrlEncode($inputJson)
                $r = Invoke-WebRequest -Uri "$($url)?input=$encoded" -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 40
            } else {
                $r = Invoke-WebRequest -Uri $url -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 40
            }
        }
        $obj = $r.Content | ConvertFrom-Json
        return @{ ok = $true; status = $r.StatusCode; data = $obj.result.data.json; raw = $r.Content }
    } catch {
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $errMsg = $_.Exception.Message
        $errBody = ""
        try {
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $errBody = $_.ErrorDetails.Message }
        } catch {}
        if (-not $errBody -and $_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $errBody = $reader.ReadToEnd(); $reader.Close()
            } catch {}
        }
        try {
            if ($errBody) {
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

function Login {
    param([string]$Email)
    $r = Invoke-Trpc "login" @{ email = $Email; password = $PW }
    if ($r.ok -and $r.data.accessToken) {
        Log-Step "AUTH" "Login $Email" "PASS" "role=$($r.data.user.role) id=$($r.data.user.id)"
        return @{ token = $r.data.accessToken; user = $r.data.user }
    }
    Log-Step "AUTH" "Login $Email" "FAIL" "$($r.error) :: $($r.body)"
    return $null
}

function Credit-Wallet {
    param([int]$UserId, [int]$Cents)
    $u = "UPDATE `"Wallet`" SET `"balanceCents`"=`"balanceCents`"+$Cents,`"updatedAt`"=now() WHERE `"userId`"=$UserId;"
    $i = "INSERT INTO `"Wallet`" (`"userId`",`"balanceCents`",`"currency`",`"createdAt`",`"updatedAt`") SELECT $UserId,$Cents,'ZAR',now(),now() WHERE NOT EXISTS (SELECT 1 FROM `"Wallet`" WHERE `"userId`"=$UserId);"
    $sql = "$u $i"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))
    & $SSH -i $SSHKEY -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 $SSHHOST "echo $b64 | base64 -d | docker exec -i investprop-postgres-1 psql -U investprop -d investprop" | Out-Host
}

Write-Host "`n========================================="
Write-Host "  Investprop FULL JOURNEY - $STAMP"
Write-Host "  Target: $BASE"
Write-Host "=========================================`n"

# =====================================================================
#  PERSONA LOGINS
# =====================================================================
$T.Mgr  = Login "devmanager@demo.com"
$T.Inv1 = Login "investor@demo.com"
$T.Inv2 = Login "investor2@demo.com"
$T.Own  = Login "owner@demo.com"
if (-not $T.Mgr) { Write-Host "[FATAL] manager login failed - aborting" -ForegroundColor Red }

$futureClose = (Get-Date).AddDays(45).ToString("yyyy-MM-ddTHH:mm:ss.000Z")

# =====================================================================
#  PHASE 1 - DEV MANAGER: create all property types
# =====================================================================
Write-Host "`n--- PHASE 1: CREATE PROPERTIES (all types) ---`n"

function New-Prop {
    param([hashtable]$Payload, [string]$Label)
    $Payload.authToken = $T.Mgr.token
    $r = Invoke-Trpc "createProperty" $Payload
    if ($r.ok -and ($r.data.propertyId -or $r.data.property.id)) {
        $newId = if ($r.data.propertyId) { $r.data.propertyId } else { $r.data.property.id }
        Log-Step "DEV-MGR" "Create $Label" "PASS" "propertyId=$newId"
        return [int]$newId
    }
    Log-Step "DEV-MGR" "Create $Label" "FAIL" "$($r.error) :: $($r.body)"
    return 0
}

# P1 - FLIP (RESALE)
$id = New-Prop @{
    title="E2E Flip Townhouse $STAMP"; description="Buy-renovate-resell 3-bed townhouse (E2E)."
    address="21 Flip Street, Kempton Park"; city="Kempton Park"; state="Gauteng"; zipCode="1619"
    price=1200000; propertyType="flip"; flipType="RESALE"
    purchasePrice=950000; renovationBudget=180000; estimatedValue=1450000; afterRepairValue=1450000
    holdingCosts=30000; closingCostsPurchase=25000; closingCostsSale=40000; estimatedRepairCosts=180000
    maxOfferPrice=1000000; daysToComplete=120; bedrooms=3; bathrooms=2; squareMeters=120
    flipFundingGoal=300000
} "FLIP (resale)"
if ($id) { $PROPS["flip"] = @{ id=$id; goal=300000; label="FLIP (resale)" } }

# P2 - RENTAL
$id = New-Prop @{
    title="E2E Rental Apartment $STAMP"; description="Buy-to-let 2-bed apartment (E2E)."
    address="5 Yield Avenue, Centurion"; city="Centurion"; state="Gauteng"; zipCode="0157"
    price=1500000; propertyType="rental"
    rentalPurchasePrice=1500000; monthlyRent=12500; annualPropertyTax=9000; annualInsurance=6000
    monthlyMaintenanceReserve=800; monthlyManagementFee=1000; vacancyRate=5; appreciationRate=4
    downPaymentAmount=300000; interestRate=11.5; loanTermYears=20; bondAmount=1200000
    bedrooms=2; bathrooms=1; squareMeters=75
    rentalFundingGoal=400000
} "RENTAL"
if ($id) { $PROPS["rental"] = @{ id=$id; goal=400000; label="RENTAL" } }

# P3 - DEVELOPMENT AFFORDABLE_RESALE
$id = New-Prop @{
    title="E2E Dev Affordable Resale $STAMP"; description="20-unit affordable housing for resale (E2E)."
    address="Erf 100, Soshanguve Ext 12"; city="Soshanguve"; state="Gauteng"; zipCode="0152"
    price=5000000; propertyType="development"; developmentType="AFFORDABLE_RESALE"
    projectName="Soshanguve Affordable Resale"; numberOfUnits=20
    landAcquisitionCost=1200000; hardCosts=6000000; softCosts=900000; financingCosts=400000
    contingencyPercent=10; expectedSalePricePerUnit=550000; totalExpectedRevenue=11000000
    developmentTimelineMonths=18
    developmentFundingGoal=500000
} "DEV (affordable resale)"
if ($id) { $PROPS["dev_resale"] = @{ id=$id; goal=500000; label="DEV (affordable resale)" } }

# P4 - DEVELOPMENT AFFORDABLE_RENTAL
$id = New-Prop @{
    title="E2E Dev Affordable Rental $STAMP"; description="30-unit affordable rental block (E2E)."
    address="Erf 220, Tembisa Ext 7"; city="Tembisa"; state="Gauteng"; zipCode="1632"
    price=6000000; propertyType="development"; developmentType="AFFORDABLE_RENTAL"
    projectName="Tembisa Affordable Rental"; numberOfUnits=30
    landAcquisitionCost=1500000; hardCosts=8000000; softCosts=1100000; financingCosts=500000
    contingencyPercent=10; expectedMonthlyRentPerUnit=4500; annualOperatingExpenses=350000
    developmentTimelineMonths=24
    developmentFundingGoal=500000
} "DEV (affordable rental)"
if ($id) { $PROPS["dev_rental"] = @{ id=$id; goal=500000; label="DEV (affordable rental)" } }

# P5 - DEVELOPMENT COMMERCIAL_RENTAL
$id = New-Prop @{
    title="E2E Dev Commercial Rental $STAMP"; description="Mixed-use commercial rental block (E2E)."
    address="12 Rivonia Road, Sandton"; city="Sandton"; state="Gauteng"; zipCode="2196"
    price=8000000; propertyType="development"; developmentType="COMMERCIAL_RENTAL"
    projectName="Sandton Commercial Rental"; numberOfUnits=10
    landAcquisitionCost=3000000; hardCosts=9000000; softCosts=1500000; financingCosts=800000
    contingencyPercent=10; expectedMonthlyRentPerUnit=22000; annualOperatingExpenses=600000
    developmentTimelineMonths=30
    developmentFundingGoal=600000
} "DEV (commercial rental)"
if ($id) { $PROPS["dev_commercial"] = @{ id=$id; goal=600000; label="DEV (commercial rental)" } }

# ---- List them back (verify all types exist & categorised correctly) ----
foreach ($typ in @("flip","rental","development")) {
    $r = Invoke-Trpc "getProperties" @{ type = $typ; limit = 50 } "GET"
    if ($r.ok) {
        $items = if ($r.data.properties) { $r.data.properties } elseif ($r.data.items) { $r.data.items } else { $r.data }
        $mine = @($items | Where-Object { $_.title -like "*$STAMP*" })
        Log-Step "DEV-MGR" "List type=$typ" "PASS" "total=$(@($items).Count) mine=$($mine.Count)"
    } else {
        Log-Step "DEV-MGR" "List type=$typ" "FAIL" "$($r.error)"
    }
}

# =====================================================================
#  PHASE 2 - SPV, publish, share class (all properties)
# =====================================================================
Write-Host "`n--- PHASE 2: SPV / PUBLISH / SHARE CLASS ---`n"

$r = Invoke-Trpc "createSPV" @{ authToken=$T.Mgr.token; name="InvestProp E2E SPV $STAMP"; registrationNumber="E2E-$STAMP"; bankName="FNB"; bankAccountNumber="620000$($STAMP.Substring(0,6))"; bankBranchCode="250655" }
if ($r.ok -and $r.data.id) {
    $T.SpvId = $r.data.id
    Log-Step "DEV-MGR" "Create SPV" "PASS" "spvId=$($T.SpvId) status=$($r.data.status)"
    $ur = Invoke-Trpc "updateSPV" @{ authToken=$T.Mgr.token; spvId=$T.SpvId; status="REGISTERED"; registeredDate=(Get-Date).ToString("yyyy-MM-dd") }
    if ($ur.ok) { Log-Step "DEV-MGR" "SPV -> REGISTERED" "PASS" "status=$($ur.data.status)" }
    else { Log-Step "DEV-MGR" "SPV -> REGISTERED" "FAIL" "$($ur.error)" }
} else {
    Log-Step "DEV-MGR" "Create SPV" "FAIL" "[$($r.status)] $($r.error) :: $($r.body)"
}

function Breakdown { param([int]$Goal)
    $a = [math]::Round($Goal * 0.5); $b = [math]::Round($Goal * 0.3); $c = $Goal - $a - $b
    return @(
        @{ category="Land and acquisition"; amount=$a; description="Site acquisition and transfer" },
        @{ category="Construction and works"; amount=$b; description="Hard costs and works" },
        @{ category="Professional and contingency"; amount=$c; description="Fees, approvals and contingency" }
    )
}

foreach ($k in @("flip","rental","dev_resale","dev_rental","dev_commercial")) {
    if (-not $PROPS.ContainsKey($k)) { continue }
    $propId = $PROPS[$k].id
    $goal   = $PROPS[$k].goal

    if ($T.SpvId) {
        $a = Invoke-Trpc "assignPropertyToSPV" @{ authToken=$T.Mgr.token; spvId=$T.SpvId; propertyId=$propId }
        if ($a.ok) { Log-Step "DEV-MGR" "Assign $k -> SPV" "PASS" "propertyId=$propId" }
        else { Log-Step "DEV-MGR" "Assign $k -> SPV" "FAIL" "[$($a.status)] $($a.error) :: $($a.body)" }
    }

    $p = Invoke-Trpc "publishPropertyForFunding" @{
        authToken=$T.Mgr.token; propertyId=$propId; fundingGoal=$goal
        fundingClosingDate=$futureClose; fundingBreakdown=(Breakdown $goal)
    }
    if ($p.ok) { Log-Step "DEV-MGR" "Publish $k" "PASS" "goal=R$goal" }
    else { Log-Step "DEV-MGR" "Publish $k" "FAIL" "[$($p.status)] $($p.error) :: $($p.body)" }

    $shares = [int]($goal / 100)
    $s = Invoke-Trpc "createShareClass" @{
        authToken=$T.Mgr.token; propertyId=$propId; name="Ordinary"
        totalShares=$shares; pricePerShare=100; minimumShares=100; minimumInvestmentAmount=10000
    }
    if ($s.ok -and $s.data.id) {
        $PROPS[$k].shareClassId = $s.data.id
        Log-Step "DEV-MGR" "ShareClass $k" "PASS" "id=$($s.data.id) $shares @ R100"
    } else {
        Log-Step "DEV-MGR" "ShareClass $k" "FAIL" "[$($s.status)] $($s.error) :: $($s.body)"
    }
}

# =====================================================================
#  PHASE 3 - INVESTORS: appropriateness + KYC
# =====================================================================
Write-Host "`n--- PHASE 3: APPROPRIATENESS + KYC ---`n"

function Do-Appropriateness {
    param($Inv, [string]$Name)
    if (-not $Inv) { return }
    $r = Invoke-Trpc "submitAppropriatenessQuestionnaire" @{
        authToken=$Inv.token; investmentExperience="EXPERIENCED"; annualIncome="750K_1_5M"
        netWorth="2M_10M"; understandsIlliquid=$true; understandsLossOfCapital=$true
        understandsCoolingOff=$true; maxLossTolerance=500000
    }
    if ($r.ok) { Log-Step $Name "Appropriateness questionnaire" "PASS" }
    else { Log-Step $Name "Appropriateness questionnaire" "FAIL" "[$($r.status)] $($r.error) :: $($r.body)" }
}

function Do-KYC {
    param($Inv, [string]$Name)
    if (-not $Inv) { return }
    foreach ($dt in @("ID_DOCUMENT","PROOF_OF_ADDRESS","BANK_STATEMENT")) {
        $u = Invoke-Trpc "uploadKYCDocument" @{ authToken=$Inv.token; documentType=$dt; documentUrl="https://docs.investprop.io/e2e/$($Name)_$dt.pdf" }
        if ($u.ok) { Log-Step $Name "Upload KYC $dt" "PASS" "docId=$($u.data.id)" }
        else { Log-Step $Name "Upload KYC $dt" "FAIL" "$($u.error)" }
    }
    $g = Invoke-Trpc "getKYCDocuments" @{ authToken=$T.Mgr.token; allPending=$true } "GET"
    if ($g.ok) {
        $docs = @($g.data | Where-Object { $_.investorId -eq $Inv.user.id -and $_.status -eq "PENDING" })
        foreach ($d in $docs) {
            $rv = Invoke-Trpc "reviewKYCDocument" @{ authToken=$T.Mgr.token; documentId=$d.id; status="APPROVED"; reviewNotes="E2E auto-approve" }
            if ($rv.ok) { Log-Step "DEV-MGR" "Approve KYC $($d.documentType) ($Name)" "PASS" }
            else { Log-Step "DEV-MGR" "Approve KYC $($d.documentType) ($Name)" "FAIL" "$($rv.error)" }
        }
    } else {
        Log-Step "DEV-MGR" "List pending KYC ($Name)" "FAIL" "$($g.error)"
    }
}

Do-Appropriateness $T.Inv1 "INVESTOR-1"
Do-Appropriateness $T.Inv2 "INVESTOR-2"
Do-KYC $T.Inv1 "INVESTOR-1"
Do-KYC $T.Inv2 "INVESTOR-2"

# =====================================================================
#  PHASE 4 - INVEST -> APPROVE -> POP -> FUND  (flip + dev_resale)
# =====================================================================
Write-Host "`n--- PHASE 4: INVESTMENT LIFECYCLE ---`n"

function Invest-Flow {
    param($Inv, [string]$Name, [int]$PropertyId, [double]$Amount, [string]$PropLabel)
    if (-not $Inv) { return 0 }
    $r = Invoke-Trpc "submitInvestmentProposal" @{ authToken=$Inv.token; propertyId=$PropertyId; contributionAmount=$Amount; strategy="BUY_AND_HOLD" }
    if (-not ($r.ok -and $r.data.contribution.id)) {
        Log-Step $Name "Invest R$Amount in $PropLabel" "FAIL" "[$($r.status)] $($r.error) :: $($r.body)"
        return 0
    }
    $cid = $r.data.contribution.id
    Log-Step $Name "Submit proposal R$Amount ($PropLabel)" "PASS" "contributionId=$cid"
    $a = Invoke-Trpc "reviewInvestmentProposal" @{ authToken=$T.Mgr.token; contributionId=$cid; action="APPROVE" }
    if ($a.ok) { Log-Step "DEV-MGR" "Approve contribution $cid" "PASS" }
    else { Log-Step "DEV-MGR" "Approve contribution $cid" "FAIL" "$($a.error)"; return $cid }
    $pop = Invoke-Trpc "submitProofOfPayment" @{ authToken=$Inv.token; contributionId=$cid; proofOfPaymentUrl="https://docs.investprop.io/e2e/pop_$cid.pdf"; paymentReference="E2E-$cid"; notes="E2E EFT proof" }
    if ($pop.ok) { Log-Step $Name "Submit POP ($cid)" "PASS" }
    else { Log-Step $Name "Submit POP ($cid)" "FAIL" "$($pop.error)"; return $cid }
    $rp = Invoke-Trpc "reviewProofOfPayment" @{ authToken=$T.Mgr.token; contributionId=$cid; action="APPROVE"; reviewNotes="E2E funds confirmed" }
    if ($rp.ok) { Log-Step "DEV-MGR" "Confirm POP ($cid) -> PAID" "PASS" }
    else { Log-Step "DEV-MGR" "Confirm POP ($cid)" "FAIL" "[$($rp.status)] $($rp.error) :: $($rp.body)" }
    return $cid
}

if ($PROPS.ContainsKey("flip")) {
    $fid = $PROPS["flip"].id
    Invest-Flow $T.Inv1 "INVESTOR-1" $fid 180000 "FLIP" | Out-Null
    Invest-Flow $T.Inv2 "INVESTOR-2" $fid 120000 "FLIP" | Out-Null
}
if ($PROPS.ContainsKey("dev_resale")) {
    $did = $PROPS["dev_resale"].id
    Invest-Flow $T.Inv1 "INVESTOR-1" $did 300000 "DEV-RESALE" | Out-Null
    Invest-Flow $T.Inv2 "INVESTOR-2" $did 200000 "DEV-RESALE" | Out-Null
}

# Verify funding on the flip
if ($PROPS.ContainsKey("flip")) {
    $r = Invoke-Trpc "getProperties" @{ type="flip"; limit=50 } "GET"
    if ($r.ok) {
        $items = if ($r.data.properties) { $r.data.properties } else { $r.data }
        $p = $items | Where-Object { $_.id -eq $PROPS["flip"].id } | Select-Object -First 1
        if ($p) {
            $raised = $p.fundingRaised
            if ([double]$raised -ge 300000) { Log-Step "CHECK" "Flip fully funded" "PASS" "raised=R$raised status=$($p.investmentStatus)" }
            else { Log-Step "CHECK" "Flip funding" "WARN" "raised=R$raised (expected >=300000) status=$($p.investmentStatus)" }
        }
    }
}

# =====================================================================
#  PHASE 5 - DISTRIBUTIONS (create + execute)
# =====================================================================
Write-Host "`n--- PHASE 5: DISTRIBUTIONS ---`n"

function Distribute {
    param([int]$PropertyId, [string]$Type, [double]$Gross, [string]$Label)
    $r = Invoke-Trpc "createDistribution" @{ authToken=$T.Mgr.token; propertyId=$PropertyId; type=$Type; grossAmount=$Gross; managementFeePercent=2; description="E2E $Type distribution" }
    if (-not ($r.ok -and $r.data.distributionId)) {
        Log-Step "DEV-MGR" "Create distribution ($Label)" "FAIL" "[$($r.status)] $($r.error) :: $($r.body)"
        return
    }
    $dist = $r.data
    Log-Step "DEV-MGR" "Create distribution ($Label)" "PASS" "id=$($dist.distributionId) investors=$($dist.totalInvestors) net=R$($dist.netAmount)"
    if ([int]$dist.totalInvestors -ge 1) { Note "Distribution split across $($dist.totalInvestors) shareholder(s), net pool R$($dist.investorPool)" }
    $e = Invoke-Trpc "executeDistribution" @{ authToken=$T.Mgr.token; distributionId=$dist.distributionId }
    if ($e.ok) { Log-Step "DEV-MGR" "Execute distribution ($Label)" "PASS" }
    else { Log-Step "DEV-MGR" "Execute distribution ($Label)" "FAIL" "[$($e.status)] $($e.error) :: $($e.body)" }
}

if ($PROPS.ContainsKey("flip"))       { Distribute $PROPS["flip"].id       "SALE_PROCEEDS" 60000  "FLIP sale proceeds" }
if ($PROPS.ContainsKey("dev_resale")) { Distribute $PROPS["dev_resale"].id "SALE_PROCEEDS" 100000 "DEV-RESALE proceeds" }

# =====================================================================
#  PHASE 6 - SECONDARY MARKET (sell + wallet-funded buy)
# =====================================================================
Write-Host "`n--- PHASE 6: SECONDARY MARKET ---`n"

if ($PROPS.ContainsKey("flip") -and $PROPS["flip"].shareClassId -and $T.Inv1 -and $T.Inv2) {
    $scId = $PROPS["flip"].shareClassId
    $sell = Invoke-Trpc "placeShareOrder" @{ authToken=$T.Inv1.token; shareClassId=$scId; side="SELL"; quantity=400; pricePerShare=100; expiresInDays=30 }
    if ($sell.ok) { Log-Step "INVESTOR-1" "Place SELL 400 @ R100" "PASS" "orderId=$($sell.data.id)" }
    else { Log-Step "INVESTOR-1" "Place SELL 400 @ R100" "FAIL" "[$($sell.status)] $($sell.error) :: $($sell.body)" }

    $cents = 60000 * 100
    Note "Crediting INVESTOR-2 wallet R60,000 via DB (test-only Paystack bypass)"
    Credit-Wallet -UserId $T.Inv2.user.id -Cents $cents
    Log-Step "SYSTEM" "Credit INVESTOR-2 wallet R60,000" "INFO" "userId=$($T.Inv2.user.id)"

    $buy = Invoke-Trpc "placeShareOrder" @{ authToken=$T.Inv2.token; shareClassId=$scId; side="BUY"; quantity=400; pricePerShare=100; expiresInDays=30 }
    if ($buy.ok) { Log-Step "INVESTOR-2" "Place BUY 400 @ R100" "PASS" "orderId=$($buy.data.id)" }
    else { Log-Step "INVESTOR-2" "Place BUY 400 @ R100" "FAIL" "[$($buy.status)] $($buy.error) :: $($buy.body)" }

    $ob = Invoke-Trpc "getOrderBook" @{ shareClassId=$scId } "GET"
    if ($ob.ok) {
        Log-Step "CHECK" "Order book" "PASS" "bestBid=$($ob.data.bestBid) bestAsk=$($ob.data.bestAsk) openSell=$(@($ob.data.sellOrders).Count) openBuy=$(@($ob.data.buyOrders).Count)"
        if (-not $ob.data.bestAsk -and -not $ob.data.bestBid) { Note "Both orders cleared -> trade settled on the secondary market" }
    }
} else {
    Log-Step "SECONDARY" "Secondary market" "WARN" "skipped (flip share class or investor missing)"
}

# =====================================================================
#  PHASE 7 - OWNER: sale proposal -> review -> promote
# =====================================================================
Write-Host "`n--- PHASE 7: OWNER SALE PROPOSAL ---`n"

if ($T.Own) {
    $sp = Invoke-Trpc "submitSaleProposal" @{
        authToken=$T.Own.token
        title="E2E Owner Sale - Family Home $STAMP"
        description="Owner-occupied 4-bed family home, selling outright. Submitted via E2E."
        address="88 Seller Lane, Roodepoort"; city="Roodepoort"; province="Gauteng"
        propertyType="House"; askingPrice=1850000; marketValue=1950000
        saleType="CASH"; urgencyLevel="STANDARD"; engagementType="OUTRIGHT_SALE"
        bondStatus="NONE"; ratesStatus="CURRENT"; tenancyStatus="OWNER_OCCUPIED"; conditionRating="GOOD"
        bedrooms=4; bathrooms=2; squareMeters=210; erfSize=600
        popiaConsent=$true; contactPhone="+27 82 555 0199"; contactEmail="owner@demo.com"
        imageUrls=@(); documentUrls=@()
    }
    if ($sp.ok -and ($sp.data.proposal.id -or $sp.data.id)) {
        $ppid = if ($sp.data.proposal.id) { $sp.data.proposal.id } else { $sp.data.id }
        $T.ProposalId = $ppid
        Log-Step "OWNER" "Submit sale proposal" "PASS" "proposalId=$ppid"
    } else {
        Log-Step "OWNER" "Submit sale proposal" "FAIL" "[$($sp.status)] $($sp.error) :: $($sp.body)"
    }

    if ($T.ProposalId) {
        $r1 = Invoke-Trpc "reviewSaleProposal" @{ authToken=$T.Mgr.token; proposalId=$T.ProposalId; action="UNDER_REVIEW"; reviewNotes="E2E triage" }
        if ($r1.ok) { Log-Step "DEV-MGR" "Sale proposal -> UNDER_REVIEW" "PASS" }
        else { Log-Step "DEV-MGR" "Sale proposal -> UNDER_REVIEW" "FAIL" "$($r1.error)" }

        $r2 = Invoke-Trpc "reviewSaleProposal" @{ authToken=$T.Mgr.token; proposalId=$T.ProposalId; action="ACCEPTED"; reviewNotes="E2E accepted" }
        if ($r2.ok) { Log-Step "DEV-MGR" "Sale proposal -> ACCEPTED" "PASS" }
        else { Log-Step "DEV-MGR" "Sale proposal -> ACCEPTED" "FAIL" "$($r2.error)" }

        $pr = Invoke-Trpc "promoteSaleProposalToProperty" @{ authToken=$T.Mgr.token; proposalId=$T.ProposalId; fundingGoal=1850000 }
        if ($pr.ok -and ($pr.data.property.id -or $pr.data.propertyId -or $pr.data.id)) {
            $npid = if ($pr.data.property.id) { $pr.data.property.id } elseif ($pr.data.propertyId) { $pr.data.propertyId } else { $pr.data.id }
            Log-Step "DEV-MGR" "Promote proposal -> property" "PASS" "newPropertyId=$npid"
        } else {
            Log-Step "DEV-MGR" "Promote proposal -> property" "FAIL" "[$($pr.status)] $($pr.error) :: $($pr.body)"
        }
    }
}

# =====================================================================
#  REPORT
# =====================================================================
$pass = @($RESULTS | Where-Object { $_.Status -eq "PASS" }).Count
$fail = @($RESULTS | Where-Object { $_.Status -eq "FAIL" }).Count
$warn = @($RESULTS | Where-Object { $_.Status -eq "WARN" }).Count

$md = @()
$md += "# Investprop - Full Multi-Persona E2E Journey"
$md += ""
$md += "- **Timestamp:** $STAMP"
$md += "- **Target:** $BASE"
$md += "- **Totals:** $pass PASS / $fail FAIL / $warn WARN (of $($RESULTS.Count) steps)"
$md += ""
$md += "## Results"
$md += ""
$md += "| Time | Persona | Step | Status | Detail |"
$md += "|------|---------|------|--------|--------|"
foreach ($e in $RESULTS) {
    $d = ($e.Detail -replace '\|','\\|')
    $md += "| $($e.Time) | $($e.Persona) | $($e.Step) | $($e.Status) | $d |"
}
$md += ""
if ($ISSUES.Count -gt 0) {
    $md += "## Issues / Failures"; $md += ""
    $md += $ISSUES
    $md += ""
}
if ($NOTES.Count -gt 0) {
    $md += "## Logical-sense notes"; $md += ""
    foreach ($n in $NOTES) { $md += "- $n" }
    $md += ""
}
$md -join "`n" | Out-File -FilePath $LOG -Encoding utf8

Write-Host "`n========================================="
Write-Host "  DONE - $pass PASS / $fail FAIL / $warn WARN"
Write-Host "  Report: $LOG"
Write-Host "=========================================`n"
