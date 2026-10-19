param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target
)

$ErrorActionPreference = 'Stop'

# Clean up any stuck Word instances first
Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $Target) { Remove-Item $Target -Force -ErrorAction SilentlyContinue }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0   # wdAlertsNone - suppress dialogs so the process never blocks

try {
    $doc = $word.Documents.Open($Source, [ref]$false, [ref]$false)
    $wdFormatDocumentDefault = 16
    [string]$out = $Target
    $doc.SaveAs2($out, [ref]$wdFormatDocumentDefault)
    $doc.Close([ref]$false)
    Write-Host "SAVED:$out"
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

if (Test-Path $Target) {
    $item = Get-Item $Target
    Write-Host ("OK:{0}:{1}KB" -f $item.Name, [math]::Round($item.Length / 1KB, 1))
}
else {
    Write-Host "FAILED"
}
