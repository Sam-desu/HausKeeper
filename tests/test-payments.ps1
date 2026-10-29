Set-Location (Split-Path $PSScriptRoot -Parent)
$listPath = '/api/invoices'
npm run seed:all 2>&1 | Out-Null
$saved = @{ PORT = $env:PORT; NODE = $env:NODE_ENV; SIM = $env:ALLOW_SIMULATED_PAYMENTS }

function Req($url, $method = 'GET', $obj = $null, $token = $null) {
  $a = @('-s', '-X', $method, '-w', '\n%{http_code}')
  if ($token) { $a += @('-H', "Authorization: Bearer $token") }
  $tmp = $null
  if ($obj) {
    $tmp = [IO.Path]::GetTempFileName()
    [IO.File]::WriteAllText($tmp, ($obj | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    $a += @('-H', 'Content-Type: application/json', '--data-binary', "@$tmp")
  }
  $out = (& curl.exe @a $url) -join "`n"
  if ($tmp) { Remove-Item $tmp -ErrorAction SilentlyContinue }
  $i = $out.LastIndexOf("`n")
  if ($i -lt 0) { return @{ Code = 0; Body = $out } }
  return @{ Code = [int]$out.Substring($i + 1); Body = $out.Substring(0, $i) }
}
function Start-Srv($port, $prod) {
  $env:PORT = "$port"
  if ($prod) { $env:NODE_ENV = 'production' } else { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
  Remove-Item Env:ALLOW_SIMULATED_PAYMENTS -ErrorAction SilentlyContinue
  $proc = Start-Process node -ArgumentList 'server/index.js' -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$env:TEMP\hk-$port.out" -RedirectStandardError "$env:TEMP\hk-$port.err"
  for ($i = 0; $i -lt 25; $i++) { Start-Sleep -Milliseconds 800; if ((Req "http://localhost:$port/api/health").Code -eq 200) { break } }
  return $proc
}
function Get-Invoices($port, $token) {
  $r = Req "http://localhost:$port$listPath" 'GET' $null $token
  $list = try { @($r.Body | ConvertFrom-Json) } catch { @() }
  if ($list.Count -eq 1 -and $list[0].invoices) { $list = @($list[0].invoices) }
  return @{ Code = $r.Code; Raw = $r.Body; List = $list }
}
# Never write to the output stream in here except the return value
function Get-FirstUnpaid($port) {
  $login = Req "http://localhost:$port/api/auth/login" 'POST' @{ role = 'tenant'; identifier = 'adrian.crisostomo@gmail.com'; password = 'adrian123' }
  $token = try { ($login.Body | ConvertFrom-Json).token } catch { $null }
  if (-not $token) { Write-Host "  login failed: $($login.Code) $($login.Body)"; return $null }
  $inv = Get-Invoices $port $token
  $unpaid = $inv.List | Where-Object { $_.status -ne 'paid' } | Select-Object -First 1
  if (-not $unpaid -or -not $unpaid.id) {
    $head = $inv.Raw.Substring(0, [Math]::Min(200, $inv.Raw.Length))
    Write-Host "  no unpaid invoice from GET $listPath (HTTP $($inv.Code)); response starts: $head"
    return $null
  }
  return @{ Token = $token; Id = $unpaid.id }
}

$procs = @()
try {
  $procs += Start-Srv 5057 $true
  $t = Get-FirstUnpaid 5057
  if (-not $t) { "FAIL: production setup (see message above)" }
  else {
    $r = Req "http://localhost:5057/api/payments/checkout/$($t.Id)" 'POST' $null $t.Token
    if ($r.Code -eq 503) { "PASS: production refuses simulated payment (503)" } else { "FAIL: production checkout -> $($r.Code) $($r.Body)" }
    $after = (Get-Invoices 5057 $t.Token).List | Where-Object { $_.id -eq $t.Id }
    if ($after -and $after.status -ne 'paid') { "PASS: invoice $($t.Id) is still unpaid" } else { "FAIL: invoice $($t.Id) status is '$($after.status)'" }
  }
  Stop-Process -Id $procs[-1].Id -Force

  $procs += Start-Srv 5058 $false
  $t = Get-FirstUnpaid 5058
  if (-not $t) { "FAIL: dev setup (see message above)" }
  else {
    $r = Req "http://localhost:5058/api/payments/checkout/$($t.Id)" 'POST' $null $t.Token
    if ($r.Code -eq 200 -and $r.Body -match '"simulated":\s*true') { "PASS: dev mode still pays instantly (simulated)" } else { "FAIL: dev checkout -> $($r.Code) $($r.Body)" }
    $after = (Get-Invoices 5058 $t.Token).List | Where-Object { $_.id -eq $t.Id }
    if ($after.status -eq 'paid') { "PASS: dev invoice is now paid" } else { "FAIL: dev invoice status is '$($after.status)'" }
  }
}
finally {
  foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
  foreach ($pair in @(@('PORT', $saved.PORT), @('NODE_ENV', $saved.NODE), @('ALLOW_SIMULATED_PAYMENTS', $saved.SIM))) {
    if ($pair[1]) { Set-Item "Env:$($pair[0])" $pair[1] } else { Remove-Item "Env:$($pair[0])" -ErrorAction SilentlyContinue }
  }
  npm run seed:all 2>&1 | Out-Null
}