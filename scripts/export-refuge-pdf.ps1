$ErrorActionPreference = 'Stop'
$dir  = "C:\Users\Thapelo\OneDrive\Documents\Business\Square 15\APP\Property Investment App\Property Investment App\proposal"
$docx = Join-Path $dir "Investprop-Partnership-Proposal Refuge Financial Services 13 October 2026.docx"
$tmp  = Join-Path $dir "_tmp_refuge.pdf"
$pdf  = Join-Path $dir "Investprop-Partnership-Proposal Refuge Financial Services 13 October 2026.pdf"

# Ensure no Word processes are running
Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Remove any stale temp
if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($docx, [ref]$false, [ref]$true)
    $doc.ExportAsFixedFormat($tmp, 17)
    $doc.Close([ref]$false)
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

# Atomic move into place only after successful export
Move-Item -LiteralPath $tmp -Destination $pdf -Force

$item = Get-Item -LiteralPath $pdf
Write-Output ("DONE: {0:N1}KB  {1}" -f ($item.Length/1KB), $item.LastWriteTime)
