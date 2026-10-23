$base = 'http://localhost:5000/api'
$script:fails = 0

function Call($method, $path, $body, $token) {
  $p = @{ Method = $method; Uri = "$base$path"; ContentType = 'application/json' }
  if ($token) { $p.Headers = @{ Authorization = "Bearer $token" } }
  if ($body)  { $p.Body = ($body | ConvertTo-Json) }
  try   { return @{ Status = 200; Body = (Invoke-RestMethod @p) } }
  catch { return @{ Status = [int]$_.Exception.Response.StatusCode; Body = $null } }
}
function Check($name, $ok) {
  if ($ok) { Write-Host "PASS  $name" -ForegroundColor Green }
  else     { Write-Host "FAIL  $name" -ForegroundColor Red; $script:fails++ }
}
function Login($role, $id, $pw) { (Call Post '/auth/login' @{ role=$role; identifier=$id; password=$pw }).Body }

$admin  = (Login 'staff' 'admin' 'admin123').token
$front  = (Login 'staff' 'staff' 'staff123').token
$carm   = Login 'tenant' 'carmela.calonzo@gmail.com' 'carmela123'
$tTok   = $carm.token
$carmId = $carm.user.id
$future = (Get-Date).AddDays(30).ToString('yyyy-MM-dd')

# --- access control ---
Check 'No token cannot list invoices (401)'        ((Call Get '/invoices').Status -eq 401)
Check 'Tenant cannot list all invoices (403)'      ((Call Get '/invoices' $null $tTok).Status -eq 403)
Check 'Front desk (has billing) can list'          ((Call Get '/invoices' $null $front).Status -eq 200)

# --- derived overdue ---
$all = Call Get '/invoices' $null $admin
Check 'Seeded invoices are present'                ($all.Body.Count -ge 6)
$i2202 = $all.Body | Where-Object { $_.id -eq 'INV-2202' }
Check 'Unpaid past-due invoice reads as overdue'   ($i2202.status -eq 'overdue')
Check 'Overdue filter includes it'                 ((Call Get '/invoices?status=overdue' $null $admin).Body.id -contains 'INV-2202')
Check 'Paid filter excludes it'                    ((Call Get '/invoices?status=paid' $null $admin).Body.id -notcontains 'INV-2202')

# --- summary ---
$s = Call Get '/invoices/summary' $null $admin
Check 'Summary returns totals'                     ($s.Status -eq 200 -and $s.Body.collected -gt 0 -and $s.Body.overdueCount -ge 3)

# --- create validation ---
Check 'Zero amount rejected (400)'                 ((Call Post '/invoices' @{ tenant=$carmId; period='X'; due=$future; amount=0 } $admin).Status -eq 400)
Check 'Missing due date rejected (400)'            ((Call Post '/invoices' @{ tenant=$carmId; period='X'; amount=100 } $admin).Status -eq 400)
Check 'Unknown tenant rejected (404)'              ((Call Post '/invoices' @{ tenant='64b000000000000000000000'; period='X'; due=$future; amount=100 } $admin).Status -eq 404)
$noRoom = Call Post '/tenants' @{ name='No Room'; email="noroom$(Get-Random)@example.com" } $admin
Check 'Tenant without a room rejected (400)'       ((Call Post '/invoices' @{ tenant=$noRoom.Body.id; period='X'; due=$future; amount=100 } $admin).Status -eq 400)
Check 'Tenant cannot create invoices (403)'        ((Call Post '/invoices' @{ tenant=$carmId; period='X'; due=$future; amount=100 } $tTok).Status -eq 403)

# --- create + balance ---
$before = (Call Get '/tenants/me' $null $tTok).Body.balance
$new = Call Post '/invoices' @{ tenant=$carmId; period='Test 1'; due=$future; amount=1000 } $admin
Check 'Invoice created with server-made ID'        ($new.Status -eq 200 -and $new.Body.id -match '^INV-\d+$' -and $new.Body.room -eq 'R-101')
Check 'Future due date reads as unpaid'            ($new.Body.status -eq 'unpaid')
Check 'Tenant balance increased by 1000'           ((Call Get '/tenants/me' $null $tTok).Body.balance -eq ($before + 1000))
$past = Call Post '/invoices' @{ tenant=$carmId; period='Test 2'; due='2026-01-01'; amount=500 } $admin
Check 'Past due date reads as overdue'             ($past.Body.status -eq 'overdue')

# --- tenant self-service ---
$mine = Call Get '/invoices/mine' $null $tTok
Check 'Tenant sees only their own invoices'        ($mine.Body.Count -ge 3 -and ($mine.Body | Where-Object { $_.tenant -ne $carmId }).Count -eq 0)
Check 'Tenant cannot pay another tenant''s invoice (404)' ((Call Post '/invoices/mine/INV-2202/pay' $null $tTok).Status -eq 404)
$paid = Call Post "/invoices/mine/$($new.Body.id)/pay" $null $tTok
Check 'Tenant pays own invoice'                    ($paid.Body.status -eq 'paid' -and $paid.Body.paidOn)
Check 'Paying twice rejected (409)'                ((Call Post "/invoices/mine/$($new.Body.id)/pay" $null $tTok).Status -eq 409)

# --- staff marks paid ---
$staffPaid = Call Post "/invoices/$($past.Body.id)/pay" $null $admin
Check 'Staff marks invoice paid'                   ($staffPaid.Body.status -eq 'paid')
Check 'Tenant balance back to starting value'      ((Call Get '/tenants/me' $null $tTok).Body.balance -eq $before)
Check 'Paying unknown invoice rejected (404)'      ((Call Post '/invoices/INV-0000/pay' $null $admin).Status -eq 404)

# --- balances on tenant list ---
$krisha = (Call Get '/tenants?q=Krisha' $null $admin).Body[0]
Check 'Krisha''s balance is computed (11600)'      ($krisha.balance -eq 11600)

Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }