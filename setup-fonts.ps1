# This file was used once to bundle fonts into frontend/fonts/.
# Font files are now committed to the repository. Delete this file.


Write-Host "`n── Step 1: Copying Tajawal WOFF2 files"
foreach ($w in @('400','500','700','800')) {
    $from = Join-Path $srcDir "tajawal-$w.woff2"
    $to   = Join-Path $fontsDir "tajawal-$w.woff2"
    if (Test-Path $from) {
        Copy-Item $from $to -Force
        $kb = [math]::Round((Get-Item $to).Length / 1024, 1)
        Write-Host "  OK  tajawal-$w.woff2  ($kb KB)"
    } else {
        Write-Host "  MISSING: $from"
    }
}

Write-Host "`n── Step 2: Downloading Cairo WOFF2 files via Google Fonts CSS API"
$weights = @(400, 500, 600, 700, 800, 900)
foreach ($w in $weights) {
    try {
        $cssUrl = "https://fonts.googleapis.com/css2?family=Cairo:wght@$w&display=swap"
        $headers = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        $css = (Invoke-WebRequest -Uri $cssUrl -Headers $headers -UseBasicParsing).Content
        if ($css -match "url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)") {
            $woff2Url = $Matches[1]
            $dest = Join-Path $fontsDir "cairo-$w.woff2"
            Invoke-WebRequest -Uri $woff2Url -Headers $headers -OutFile $dest -UseBasicParsing
            $kb = [math]::Round((Get-Item $dest).Length / 1024, 1)
            Write-Host "  OK  cairo-$w.woff2  ($kb KB)"
        } else {
            Write-Host "  WARN: No woff2 URL found for Cairo weight $w"
        }
    } catch {
        Write-Host "  ERR cairo-$w : $_"
    }
}

Write-Host "`n── Files now in frontend\fonts\"
Get-ChildItem $fontsDir -Filter "*.woff2" | Sort-Object Name | ForEach-Object {
    $kb = [math]::Round($_.Length / 1024, 1)
    Write-Host "  $($_.Name)  ($kb KB)"
}
Write-Host "`nDone."
