# Multi-persona live logic audit harness.
# Exercises query + safe mutation procedures per persona against production,
# flags 500/INTERNAL errors (real bugs) vs benign input/auth rejections.
$ErrorActionPreference = "Stop"
$base = "https://investprop.io/trpc"
$cacheFile = Join-Path $PSScriptRoot ".audit-tokens.json"
$tokenCache = @{}
if (Test-Path $cacheFile) {
  try { (Get-Content $cacheFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $tokenCache[$_.Name] = $_.Value } } catch {}
}

function Login($email) {
  if ($tokenCache.ContainsKey($email) -and $tokenCache[$email]) {
    return $tokenCache[$email]
  }
  $pw = "password123"
  if ($email -eq "admin@investprop.io" -and $env:INVESTPROP_ADMIN_PASSWORD) { $pw = $env:INVESTPROP_ADMIN_PASSWORD }
  $body = @{ json = @{ email = $email; password = $pw } } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$base/login" -Method Post -ContentType "application/json" -Body $body
  $acct = $r.result.data.json
  $tokenCache[$email] = $acct
  ($tokenCache | ConvertTo-Json -Depth 8) | Set-Content $cacheFile
  return $acct
}

# Invoke a procedure. kind = 'query' (GET) or 'mutation' (POST).
function Call($tok, $name, $kind, $inp) {
  $headers = @{ Authorization = "Bearer $tok" }
  if ($null -ne $inp -and $inp.ContainsKey("authToken")) { $inp = @{} + $inp; $inp["authToken"] = $tok }
  try {
    if ($kind -eq "query") {
      $url = "$base/$name"
      if ($null -ne $inp) {
        $enc = [uri]::EscapeDataString((@{ json = $inp } | ConvertTo-Json -Compress -Depth 12))
        $url = "$url`?input=$enc"
      }
      $resp = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -ContentType "application/json" -UseBasicParsing
    } else {
      $b = if ($null -ne $inp) { @{ json = $inp } | ConvertTo-Json -Depth 12 } else { "{}" }
      $resp = Invoke-WebRequest -Uri "$base/$name" -Method Post -Headers $headers -ContentType "application/json" -Body $b -UseBasicParsing
    }
    return [pscustomobject]@{ name = $name; http = [int]$resp.StatusCode; code = "OK"; ok = $true; msg = "" }
  } catch {
    $sc = -1; if ($_.Exception.Response) { try { $sc = [int]$_.Exception.Response.StatusCode } catch {} }
    $raw = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $raw = $_.ErrorDetails.Message }
    if (-not $raw -and $_.Exception.Response) {
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $raw = $reader.ReadToEnd()
      } catch {}
    }
    $code = "?"; $msg = ""
    if ($raw) {
      if ($raw -match '"code"\s*:\s*"(\w+)"') { $code = $matches[1] }
      if ($raw -match '"message"\s*:\s*"((\\.|[^"\\])*)"') { $msg = $matches[1] }
      if ($raw -match '"zodError"' -and $code -eq "?") { $code = "ZOD" }
    }
    return [pscustomobject]@{ name = $name; http = $sc; code = $code; ok = $false; msg = $msg }
  }
}

function RunSet($label, $email, $calls) {
  $acct = Login $email
  $tok = $acct.accessToken
  Write-Host "`n===== $label  ($($acct.user.role), id=$($acct.user.id)) =====" -ForegroundColor Cyan
  $results = @()
  foreach ($c in $calls) {
    $results += Call $tok $c.n $c.k $c.i
  }
  # Real bugs: HTTP 500 / INTERNAL_SERVER_ERROR. Everything else is classified.
  $bugs = $results | Where-Object { $_.http -ge 500 -or $_.code -eq "INTERNAL_SERVER_ERROR" }
  $ok = ($results | Where-Object { $_.ok }).Count
  $zod = ($results | Where-Object { $_.code -eq "ZOD" -or $_.code -eq "BAD_REQUEST" }).Count
  $auth = ($results | Where-Object { $_.code -eq "FORBIDDEN" -or $_.code -eq "UNAUTHORIZED" }).Count
  $nf = ($results | Where-Object { $_.code -eq "NOT_FOUND" }).Count
  $sumCol = if ($bugs.Count) { "Red" } else { "Green" }
  Write-Host ("  OK=$ok  INPUT=$zod  AUTH=$auth  NOT_FOUND=$nf  BUGS=" + $bugs.Count) -ForegroundColor $sumCol
  foreach ($r in $results) {
    if (-not $r.ok) {
      $col = if ($r.http -ge 500) { "Red" } elseif ($r.code -in @("FORBIDDEN","UNAUTHORIZED")) { "DarkGray" } else { "Yellow" }
      Write-Host ("    [{0,3}] {1,-34} {2} {3}" -f $r.http, $r.name, $r.code, $r.msg) -ForegroundColor $col
    }
  }
  if ($bugs.Count) {
    Write-Host "  >>> BUGS:" -ForegroundColor Red
    $bugs | ForEach-Object { Write-Host ("      {0}  http={1}  {2}" -f $_.name, $_.http, $_.msg) -ForegroundColor Red }
  }
  return $results
}

# ---------------- INVESTOR ----------------
$investorCalls = @(
  @{n="getMe";k="query";i=@{authToken="T"}},
  @{n="getProperties";k="query";i=@{}},
  @{n="getInvestmentOpportunities";k="query";i=@{authToken="T"}},
  @{n="getInvestmentPackages";k="query";i=@{authToken="T"}},
  @{n="getMyContributions";k="query";i=@{authToken="T"}},
  @{n="getInvestorPortfolio";k="query";i=@{authToken="T"}},
  @{n="getMyShareHoldings";k="query";i=@{authToken="T"}},
  @{n="getShareLedger";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getMyCertificates";k="query";i=@{authToken="T"}},
  @{n="getMyDistributions";k="query";i=@{authToken="T"}},
  @{n="getMyDocuments";k="query";i=@{authToken="T"}},
  @{n="listMyDocuments";k="query";i=@{authToken="T"}},
  @{n="getKYCProfile";k="query";i=@{authToken="T"}},
  @{n="getMyFicaStatus";k="query";i=@{authToken="T"}},
  @{n="getFICAStatus";k="query";i=@{authToken="T"}},
  @{n="getAppropriatenessStatus";k="query";i=@{authToken="T"}},
  @{n="checkKYCCompliance";k="query";i=@{authToken="T";investorId=2}},
  @{n="getComplianceDashboard";k="query";i=@{authToken="T"}},
  @{n="getRegulatoryChecklist";k="query";i=@{authToken="T"}},
  @{n="getInvestorPreferences";k="query";i=@{authToken="T"}},
  @{n="getAiDigestPrefs";k="query";i=@{authToken="T"}},
  @{n="getNotifications";k="query";i=@{}},
  @{n="getMarketplaceOverview";k="query";i=@{authToken="T"}},
  @{n="getOrderBook";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getMyOrders";k="query";i=@{authToken="T"}},
  @{n="getSharePriceHistory";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getMySubscription";k="query";i=@{authToken="T"}},
  @{n="getSubscriptionPlans";k="query";i=$null},
  @{n="getDistributionForecast";k="query";i=@{authToken="T"}},
  @{n="getCapTablePreview";k="query";i=@{authToken="T";propertyId=1}},
  @{n="generateTaxCertificate";k="query";i=@{authToken="T";taxYear=2026}},
  @{n="getMyPrequalifications";k="query";i=@{authToken="T"}},
  @{n="getMyHomeLoanApplications";k="query";i=@{authToken="T"}},
  @{n="getMyDistressedAlerts";k="query";i=@{authToken="T"}},
  @{n="getPlatformTrackRecord";k="query";i=@{authToken="T"}},
  @{n="generateInvestorStatement";k="query";i=@{authToken="T"}},
  @{n="getDistressedListings";k="query";i=@{authToken="T"}},
  @{n="getDistressedDashboardSummary";k="query";i=@{authToken="T"}},
  @{n="getAnonymisedMarketData";k="query";i=@{authToken="T"}},
  @{n="getGovernanceRules";k="query";i=@{}},
  @{n="getProposals";k="query";i=@{}}
)

$invRes = RunSet "INVESTOR" "investor2@demo.com" $investorCalls

# ---------------- ADMIN ----------------
$adminCalls = @(
  @{n="getMe";k="query";i=@{authToken="T"}},
  @{n="getAllUsers";k="query";i=@{}},
  @{n="getSystemStats";k="query";i=$null},
  @{n="getSystemHealth";k="query";i=@{authToken="T"}},
  @{n="getPlatformRevenueSummary";k="query";i=$null},
  @{n="getPlatformRevenueLedger";k="query";i=@{}},
  @{n="getPlatformFeeConfig";k="query";i=$null},
  @{n="getSubscriptionStats";k="query";i=@{authToken="T"}},
  @{n="getKYCDocuments";k="query";i=@{authToken="T";allPending=$true}},
  @{n="getAdminActionInbox";k="query";i=@{authToken="T"}},
  @{n="getAuditLogs";k="query";i=@{}},
  @{n="listAuditLog";k="query";i=@{authToken="T"}},
  @{n="getAllCertificates";k="query";i=@{authToken="T"}},
  @{n="getHomeLoanApplicationsAdmin";k="query";i=@{authToken="T"}},
  @{n="getReferralLeads";k="query";i=@{authToken="T"}},
  @{n="getReferralSummary";k="query";i=@{authToken="T"}},
  @{n="getReferralPartners";k="query";i=@{authToken="T"}},
  @{n="getDistressedSources";k="query";i=@{authToken="T"}},
  @{n="getScrapeLogs";k="query";i=@{authToken="T"}},
  @{n="getFSCAReadiness";k="query";i=@{authToken="T"}},
  @{n="getPendingContractorProfiles";k="query";i=@{authToken="T"}},
  @{n="getInvestorsFicaStatus";k="query";i=@{authToken="T"}},
  @{n="getPendingPayments";k="query";i=@{authToken="T"}},
  @{n="getPendingInvestmentProposals";k="query";i=@{authToken="T"}},
  @{n="getSaleProposals";k="query";i=@{authToken="T"}},
  @{n="getContractors";k="query";i=@{authToken="T"}},
  @{n="getSubscriptionStats";k="query";i=@{authToken="T"}}
)
$admRes = RunSet "ADMIN" "admin@investprop.io" $adminCalls

# ---------------- PROJECT MANAGER ----------------
$pmCalls = @(
  @{n="getMe";k="query";i=@{authToken="T"}},
  @{n="getPmTodayInbox";k="query";i=@{authToken="T"}},
  @{n="getProperties";k="query";i=@{}},
  @{n="getSPVs";k="query";i=@{authToken="T"}},
  @{n="getAcquisitions";k="query";i=@{authToken="T"}},
  @{n="getPendingInvestmentProposals";k="query";i=@{authToken="T"}},
  @{n="getPendingPayments";k="query";i=@{authToken="T"}},
  @{n="getRFQs";k="query";i=@{authToken="T"}},
  @{n="getWorkOrders";k="query";i=@{authToken="T"}},
  @{n="getContractorInvoices";k="query";i=@{authToken="T"}},
  @{n="getContractors";k="query";i=@{authToken="T"}},
  @{n="getInvestorsFicaStatus";k="query";i=@{authToken="T"}},
  @{n="getSaleProposals";k="query";i=@{authToken="T"}},
  @{n="getKYCDocuments";k="query";i=@{authToken="T";allPending=$true}},
  @{n="getDevelopmentMetrics";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getBudgetEntries";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getMilestones";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getRisks";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getProgressSubmissions";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getDistributions";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getInvestors";k="query";i=@{authToken="T"}},
  @{n="getGlobalInvestorMetrics";k="query";i=@{authToken="T"}},
  @{n="getInvestorContributions";k="query";i=@{authToken="T";propertyId=1}}
)
$pmRes = RunSet "PROJECT_MANAGER" "pm@demo.com" $pmCalls

# ---------------- DEVELOPMENT MANAGER ----------------
$dmCalls = @(
  @{n="getMe";k="query";i=@{authToken="T"}},
  @{n="getPmTodayInbox";k="query";i=@{authToken="T"}},
  @{n="getAdminActionInbox";k="query";i=@{authToken="T"}},
  @{n="getProperties";k="query";i=@{}},
  @{n="getSPVs";k="query";i=@{authToken="T"}},
  @{n="getAcquisitions";k="query";i=@{authToken="T"}},
  @{n="getPendingInvestmentProposals";k="query";i=@{authToken="T"}},
  @{n="getPendingPayments";k="query";i=@{authToken="T"}},
  @{n="getSaleProposals";k="query";i=@{authToken="T"}},
  @{n="getProposals";k="query";i=@{}},
  @{n="getGovernanceRules";k="query";i=@{}},
  @{n="getPlatformRevenueSummary";k="query";i=$null},
  @{n="getRFQs";k="query";i=@{authToken="T"}},
  @{n="getWorkOrders";k="query";i=@{authToken="T"}},
  @{n="getContractorInvoices";k="query";i=@{authToken="T"}},
  @{n="getInvestorsFicaStatus";k="query";i=@{authToken="T"}},
  @{n="getKYCDocuments";k="query";i=@{authToken="T";allPending=$true}},
  @{n="getDevelopmentMetrics";k="query";i=@{authToken="T";propertyId=1}},
  @{n="getDistributions";k="query";i=@{authToken="T";propertyId=1}}
)
$dmRes = RunSet "DEVELOPMENT_MANAGER" "devmanager@demo.com" $dmCalls

Write-Host "`n===== AUDIT COMPLETE =====" -ForegroundColor Cyan
