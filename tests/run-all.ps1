# Reseeds before each suite (they expect fresh data), then prints one summary table.
# The server must be running in development mode (not NODE_ENV=production).
Set-Location (Split-Path $PSScriptRoot -Parent)

$port = 5000
$portLine = Get-Content .env | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
if ($portLine) { $port = ($portLine -replace '^PORT=', '').Trim() }
try { Invoke-WebRequest "http://localhost:$port/api/health" -UseBasicParsing | Out-Null }
catch { Write-Host "Server is not running on port $port. Start it with: npm run server" -ForegroundColor Red; return }

$suites = 'test-auth', 'test-tenants', 'test-invoices', 'test-tickets', 'test-admin', 'test-housing', 'test-map', 'test-9c'
$summary = @()

foreach ($s in $suites) {
  Write-Host "=== $s ===" -ForegroundColor Cyan
  npm run seed:all | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "Seeding failed (is NODE_ENV set to production in this window?). Stopping." -ForegroundColor Red; return }
  $out = powershell -ExecutionPolicy Bypass -File ".\tests\$s.ps1"
  $fails = @($out | Select-String -CaseSensitive '^\s*FAIL\b')
  $fails | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  $ok = ($out -join "`n") -match 'All checks passed' -and $fails.Count -eq 0
  $summary += [pscustomobject]@{ Suite = $s; Status = $(if ($ok) { 'PASS' } else { 'FAIL' }); Fails = $fails.Count; LastLine = ($out | Select-Object -Last 1) }
}

Write-Host '=== reservation expiry (read the output above/below) ===' -ForegroundColor Cyan
npm run seed:all | Out-Null
node server/check-expiry.js
$summary += [pscustomobject]@{ Suite = 'check-expiry'; Status = $(if ($LASTEXITCODE -eq 0) { 'ran' } else { 'FAIL' }); Fails = ''; LastLine = '' }

$summary | Format-Table -AutoSize
