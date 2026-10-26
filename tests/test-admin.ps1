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
function Csv($query, $token) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$base/reports/invoices.csv$query" -Headers @{ Authorization = "Bearer $token" }
    return @{ Status = 200; Res = $r }
  } catch { return @{ Status = [int]$_.Exception.Response.StatusCode; Res = $null } }
}

$adm   = Login 'staff' 'admin' 'admin123'
$admin = $adm.token
$front = (Login 'staff' 'staff' 'staff123').token
$tTok  = (Login 'tenant' 'carmela.calonzo@gmail.com' 'carmela123').token
$uname = "tester$(Get-Random)"

# ================= staff =================
Check 'No token cannot list staff (401)'            ((Call Get '/staff').Status -eq 401)
Check 'Front desk (no staff perm) blocked (403)'    ((Call Get '/staff' $null $front).Status -eq 403)
Check 'Tenant blocked from staff list (403)'        ((Call Get '/staff' $null $tTok).Status -eq 403)
$list = Call Get '/staff' $null $admin
Check 'Admin lists staff'                           ($list.Status -eq 200 -and $list.Body.username -contains 'admin')
Check 'Passwords are never returned'                (($list.Body | Where-Object { $_.PSObject.Properties.Name -contains 'password' }).Count -eq 0)

$new = Call Post '/staff' @{ name='Test Staff'; role='Cashier'; username=$uname; password='pass1234'; perms=@('billing') } $admin
Check 'Admin creates a staff member'                ($new.Status -eq 200 -and $new.Body.username -eq $uname -and $new.Body.perms -contains 'billing')
$nid = $new.Body.id
Check 'Duplicate username rejected (409)'           ((Call Post '/staff' @{ name='Dup'; username=$uname; password='pass1234'; perms=@() } $admin).Status -eq 409)
Check 'Invalid username rejected (400)'             ((Call Post '/staff' @{ name='X'; username='a b'; password='pass1234'; perms=@() } $admin).Status -eq 400)
Check 'Short password rejected (400)'               ((Call Post '/staff' @{ name='X'; username="short$(Get-Random)"; password='123'; perms=@() } $admin).Status -eq 400)
Check 'Unknown permission rejected (400)'           ((Call Post '/staff' @{ name='X'; username="perm$(Get-Random)"; password='pass1234'; perms=@('god') } $admin).Status -eq 400)

$sTok = (Login 'staff' $uname 'pass1234').token
Check 'New staff can log in'                        ([bool]$sTok)
Check 'New staff can use a granted permission'      ((Call Get '/invoices' $null $sTok).Status -eq 200)
Check 'New staff blocked without permission (403)'  ((Call Get '/tickets' $null $sTok).Status -eq 403)

$u = Call Put "/staff/$nid" @{ name='Renamed Staff'; role='Supervisor'; perms=@('billing','maintenance') } $admin
Check 'Admin edits name, role and permissions'      ($u.Body.name -eq 'Renamed Staff' -and $u.Body.role -eq 'Supervisor' -and $u.Body.perms -contains 'maintenance')
Check 'Permission change applies to the SAME token' ((Call Get '/tickets' $null $sTok).Status -eq 200)
Check 'Username cannot be changed'                  ((Call Put "/staff/$nid" @{ username='hacker' } $admin).Body.username -eq $uname)

Call Put "/staff/$nid" @{ password='newpass99' } $admin | Out-Null
Check 'Password reset works'                        ((Call Post '/auth/login' @{ role='staff'; identifier=$uname; password='newpass99' }).Status -eq 200)
Check 'Old password stops working (401)'            ((Call Post '/auth/login' @{ role='staff'; identifier=$uname; password='pass1234' }).Status -eq 401)
Check 'Short reset password rejected (400)'         ((Call Put "/staff/$nid" @{ password='1' } $admin).Status -eq 400)
Check 'Cannot remove the last "staff" permission (409)' ((Call Put "/staff/$($adm.user.id)" @{ perms=@('tenants') } $admin).Status -eq 409)
Check 'Unknown staff member returns 404'            ((Call Put '/staff/64b000000000000000000000' @{ name='X' } $admin).Status -eq 404)

# ================= settings =================
$pub = Call Get '/settings/public'
Check 'Public settings need no token'               ($pub.Status -eq 200 -and $pub.Body.propertyName)
Check 'Public settings hide the templates'          ($pub.Body.PSObject.Properties.Name -notcontains 'notifTemplates')
Check 'Full settings need a token (401)'            ((Call Get '/settings').Status -eq 401)
Check 'Front desk (no settings perm) blocked (403)' ((Call Get '/settings' $null $front).Status -eq 403)
$cur = (Call Get '/settings' $null $admin).Body
Check 'Admin reads full settings'                   ($cur.notifTemplates.invoice -and $cur.billingCycle)
Check 'Front desk cannot edit settings (403)'       ((Call Put '/settings' @{ address='Hacked' } $front).Status -eq 403)
$e = Call Put '/settings' @{ address='99 Test Street' } $admin
Check 'Editing one field leaves the others alone'   ($e.Body.address -eq '99 Test Street' -and $e.Body.propertyName -eq $cur.propertyName)
Check 'Empty property name rejected (400)'          ((Call Put '/settings' @{ propertyName='   ' } $admin).Status -eq 400)
$t = Call Put '/settings' @{ notifTemplates=@{ invoice='Hi {name}, test' } } $admin
Check 'Partial template update keeps the others'    ($t.Body.notifTemplates.invoice -eq 'Hi {name}, test' -and $t.Body.notifTemplates.overdue -eq $cur.notifTemplates.overdue)
Call Put '/settings' @{ address=$cur.address; notifTemplates=@{ invoice=$cur.notifTemplates.invoice } } $admin | Out-Null
Check 'Settings restored to original values'        ((Call Get '/settings' $null $admin).Body.address -eq $cur.address)

# ================= dashboard =================
Check 'Dashboard needs a token (401)'               ((Call Get '/reports/dashboard').Status -eq 401)
Check 'Tenant blocked from dashboard (403)'         ((Call Get '/reports/dashboard' $null $tTok).Status -eq 403)
$d = Call Get '/reports/dashboard' $null $admin
Check 'Dashboard returns occupancy'                 ($d.Status -eq 200 -and $d.Body.occupancy.total -ge 1 -and $d.Body.occupancy.rate -le 100)
Check 'Floor totals add up to the room total'       ((($d.Body.occupancy.byFloor | Measure-Object -Property total -Sum).Sum) -eq $d.Body.occupancy.total)
Check 'Admin sees the billing section'              ($d.Body.billing.collected -gt 0 -and $d.Body.billing.overdueCount -ge 1)
Check 'Overdue list includes tenant names'          ($d.Body.billing.attention.Count -ge 1 -and $d.Body.billing.attention[0].tenantName)
Check 'Admin sees the tickets section'              ($d.Body.tickets.open -ge 1)

$lite = Call Post '/staff' @{ name='Lite'; username="lite$(Get-Random)"; password='lite1234'; perms=@('tenants') } $admin
$liteTok = (Login 'staff' $lite.Body.username 'lite1234').token
$ld = Call Get '/reports/dashboard' $null $liteTok
Check 'Staff without billing/maintenance get no money or ticket data' ($ld.Status -eq 200 -and $null -eq $ld.Body.billing -and $null -eq $ld.Body.tickets)
Check 'They still see occupancy'                    ($ld.Body.occupancy.total -ge 1)

# ================= reports summary =================
$s = Call Get '/reports/summary' $null $admin
Check 'Summary returns revenue by floor'            ($s.Status -eq 200 -and $s.Body.revenueByFloor.Count -ge 3)
Check 'Room status counts add up to the total'      (($s.Body.rooms.occupied + $s.Body.rooms.available + $s.Body.rooms.maintenance) -eq $s.Body.rooms.total)
Check 'Total collected matches the billing summary' ($s.Body.totalCollected -eq (Call Get '/invoices/summary' $null $admin).Body.collected)
Check 'Staff without billing blocked (403)'         ((Call Get '/reports/summary' $null $liteTok).Status -eq 403)
Check 'Tenant blocked from reports (403)'           ((Call Get '/reports/summary' $null $tTok).Status -eq 403)

# ================= CSV export =================
$csv = Csv '' $admin
Check 'CSV export downloads with the right type'    ($csv.Status -eq 200 -and "$($csv.Res.Headers['Content-Type'])" -match 'text/csv' -and $csv.Res.Content -match 'INV-2201')
Check 'CSV has a header row'                        ($csv.Res.Content -match 'Invoice,Tenant,Room')
Check 'CSV export needs billing permission (403)'   ((Csv '' $liteTok).Status -eq 403)
$od = Csv '?status=overdue' $admin
Check 'CSV status filter works'                     ($od.Res.Content -match ',overdue,' -and $od.Res.Content -notmatch ',paid,')

Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }