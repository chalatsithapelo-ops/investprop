# Build + install the Flutter mobile app RELIABLY.
#
# WHY THIS EXISTS: this project lives under OneDrive, which normalises file
# modification times. Flutter's incremental Dart compiler is mtime-keyed, so it
# often fails to detect changed .dart files and ships STALE code in the release
# APK (UI edits appear "not applied" even though source + git are correct).
#
# This script defeats that by always running `flutter clean` first, then VERIFIES
# the freshly built APK actually contains the current source by extracting
# libapp.so and byte-scanning for a caller-supplied marker string before install.
#
# Usage:
#   pwsh scripts/build-mobile.ps1 -Serial Q4DYD23606005013 -Verify "ask about any listing"
#   pwsh scripts/build-mobile.ps1            # build only, no install, no verify
param(
  [string]$Serial = "",
  [string]$Verify = "",
  [switch]$NoClean
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
$apk = Join-Path $mobile "build\app\outputs\flutter-apk\app-release.apk"
$pkg = "io.investprop.investprop_mobile"
$adb = Join-Path $env:LOCALAPPDATA "Android\sdk\platform-tools\adb.exe"

Push-Location $mobile
try {
  if (-not $NoClean) { Write-Host "== flutter clean (defeats stale Dart cache) =="; flutter clean | Out-Null }
  Write-Host "== flutter build apk --release =="
  flutter build apk --release
  if ($LASTEXITCODE -ne 0) { throw "flutter build failed ($LASTEXITCODE)" }
} finally { Pop-Location }

if (-not (Test-Path $apk)) { throw "APK not found at $apk" }
Write-Host ("APK built: {0}  ({1:N1} MB)" -f (Get-Item $apk).LastWriteTime, ((Get-Item $apk).Length / 1MB))

# --- Verify the APK actually contains the current code (not a stale cache) ---
if ($Verify) {
  $dir = Join-Path $env:TEMP "apkverify"
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
  New-Item -ItemType Directory $dir | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
  ($zip.Entries | Where-Object { $_.FullName -eq "lib/arm64-v8a/libapp.so" }) |
    ForEach-Object { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($_, "$dir\libapp.so", $true) }
  $zip.Dispose()
  $bytes = [System.IO.File]::ReadAllBytes("$dir\libapp.so")
  function Find-Bytes($hay, $s, $e) {
    $n = $e.GetBytes($s)
    for ($i = 0; $i -le $hay.Length - $n.Length; $i++) {
      $m = $true
      for ($j = 0; $j -lt $n.Length; $j++) { if ($hay[$i + $j] -ne $n[$j]) { $m = $false; break } }
      if ($m) { return $i }
    }
    return -1
  }
  # Strings containing em-dash/ellipsis are stored UTF-16; plain ASCII otherwise.
  $atU16 = Find-Bytes $bytes $Verify ([Text.Encoding]::Unicode)
  $atAsc = Find-Bytes $bytes $Verify ([Text.Encoding]::ASCII)
  if ($atU16 -lt 0 -and $atAsc -lt 0) {
    throw "VERIFY FAILED: '$Verify' not found in libapp.so — APK is STALE. Aborting install."
  }
  Write-Host "VERIFY OK: '$Verify' found in APK (u16@$atU16 asc@$atAsc)"
}

# --- Install ---
if ($Serial) {
  Write-Host "== install to $Serial =="
  & $adb -s $Serial shell am force-stop $pkg
  & $adb -s $Serial install -r "$apk"
  if ($LASTEXITCODE -ne 0) { throw "adb install failed ($LASTEXITCODE)" }
  & $adb -s $Serial shell dumpsys package $pkg | Select-String "lastUpdateTime"
  & $adb -s $Serial shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 2>&1 | Select-Object -Last 1
  Write-Host "Installed + launched on $Serial"
}
