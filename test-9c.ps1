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

$admin = (Login 'staff' 'admin' 'admin123').token
$front = (Login 'staff' 'staff' 'staff123').token
$carm  = Login 'tenant' 'carmela.calonzo@gmail.com' 'carmela123'
$tTok  = $carm.token; $carmId = $carm.user.id

# rooms: tenant names for staff only
$rooms = (Call Get '/rooms' $null $admin).Body
Check 'Staff room list includes tenantName'        (($rooms | Where-Object { $_.id -eq 'R-101' }).tenantName -eq 'Carmela Calonzo')
Check 'Empty rooms have no tenantName'             ($null -eq ($rooms | Where-Object { $_.id -eq 'R-102' }).tenantName)
$pub = @((Call Get '/rooms').Body)[0]
Check 'Public room list hides tenant and name'     ($pub.PSObject.Properties.Name -notcontains 'tenant' -and $pub.PSObject.Properties.Name -notcontains 'tenantName')

# invoices: names + tenant filter
$inv = @((Call Get '/invoices' $null $admin).Body)
$i1 = $inv | Where-Object { $_.id -eq 'INV-2201' }
Check 'Invoice list includes tenantName'           ($i1.tenantName -eq 'Carmela Calonzo')
Check 'Invoice tenant is still a plain id'         ($i1.tenant -eq $carmId)
$only = @((Call Get "/invoices?tenant=$carmId" $null $admin).Body)
Check 'Invoice tenant filter works'                ($only.Count -ge 1 -and ($only | Where-Object { $_.tenant -ne $carmId }).Count -eq 0)
Check 'Tenant''s own invoice list is unchanged'    (@((Call Get '/invoices/mine' $null $tTok).Body)[0].tenant -eq $carmId)

# billable tenants
$noRoomEmail = "noroom$(Get-Random)@example.com"
Call Post '/tenants' @{ name = 'Zed NoRoom'; email = $noRoomEmail } $admin | Out-Null
$bill = Call Get '/invoices/billable' $null $admin
Check 'Billable list returns tenants with rooms'   ($bill.Status -eq 200 -and ($bill.Body | Where-Object { $_.name -eq 'Carmela Calonzo' }).room -eq 'R-101')
Check 'Tenants without a room are excluded'        ($bill.Body.name -notcontains 'Zed NoRoom')
Check 'Front desk (billing perm) can use it'       ((Call Get '/invoices/billable' $null $front).Status -eq 200)
Check 'Tenant cannot use it (403)'                 ((Call Get '/invoices/billable' $null $tTok).Status -eq 403)
Check 'No token cannot use it (401)'               ((Call Get '/invoices/billable').Status -eq 401)

# tickets: tenant filter
$t = @((Call Get "/tickets?tenant=$carmId" $null $admin).Body)
Check 'Ticket tenant filter works'                 ($t.Count -ge 1 -and ($t | Where-Object { $_.tenant -ne $carmId }).Count -eq 0)
Check 'Bad tenant id rejected (400)'               ((Call Get '/tickets?tenant=nope' $null $admin).Status -eq 400)

Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }