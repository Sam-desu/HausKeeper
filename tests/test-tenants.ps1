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
function Login($role, $id, $pw) { (Call Post '/auth/login' @{ role=$role; identifier=$id; password=$pw }).Body.token }

$admin = Login 'staff' 'admin' 'admin123'
$front = Login 'staff' 'staff' 'staff123'
$email = "test$(Get-Random)@example.com"

# --- staff: create + room linking ---
$c = Call Post '/tenants' @{ name='Test Tenant'; email=$email; password='test1234'; room='R-102' } $admin
Check 'Admin creates tenant with a room'           ($c.Status -eq 200 -and $c.Body.room -eq 'R-102')
$id = $c.Body.id
$r = Call Get '/rooms/R-102' $null $admin
Check 'Room became occupied and points to tenant'  ($r.Body.status -eq 'occupied' -and $r.Body.tenant -eq $id)
Check 'Duplicate email rejected (409)'             ((Call Post '/tenants' @{ name='Dup'; email=$email } $admin).Status -eq 409)
Check 'Assigning an occupied room rejected (409)'  ((Call Post '/tenants' @{ name='X'; email="x$(Get-Random)@example.com"; room='R-101' } $admin).Status -eq 409)
Check 'Assigning a missing room rejected (404)'    ((Call Post '/tenants' @{ name='X'; email="y$(Get-Random)@example.com"; room='R-NOPE' } $admin).Status -eq 404)

# --- staff: move room ---
$m = Call Put "/tenants/$id" @{ room='R-202' } $admin
Check 'Tenant moved to another room'               ($m.Status -eq 200 -and $m.Body.room -eq 'R-202')
Check 'Old room was freed'                         ((Call Get '/rooms/R-102' $null $admin).Body.status -eq 'available')
Check 'New room is occupied'                       ((Call Get '/rooms/R-202' $null $admin).Body.status -eq 'occupied')
Check 'Failed move keeps tenant in current room'   ((Call Put "/tenants/$id" @{ room='R-101' } $admin).Status -eq 409 -and (Call Get "/tenants/$id" $null $admin).Body.room -eq 'R-202')

# --- list / permissions ---
$list = Call Get '/tenants?q=Test' $null $admin
Check 'Search finds the new tenant'                ($list.Body.id -contains $id)
Check 'Front desk (has "tenants" perm) can list'   ((Call Get '/tenants' $null $front).Status -eq 200)
Check 'No token cannot list tenants (401)'         ((Call Get '/tenants').Status -eq 401)

# --- tenant self-service ---
$t = Login 'tenant' $email 'test1234'
Check 'New tenant can log in'                      ([bool]$t)
Check 'Tenant cannot list all tenants (403)'       ((Call Get '/tenants' $null $t).Status -eq 403)
Check 'Tenant reads own profile'                   ((Call Get '/tenants/me' $null $t).Body.email -eq $email)
Check 'Tenant updates own phone'                   ((Call Put '/tenants/me' @{ phone='0999 111 2222' } $t).Body.phone -eq '0999 111 2222')
Check 'Tenant cannot take another tenant''s email' ((Call Put '/tenants/me' @{ email='carmela.calonzo@gmail.com' } $t).Status -eq 409)
Check 'Wrong current password rejected (400)'      ((Call Put '/tenants/me/password' @{ current='wrong'; next='abcd1234' } $t).Status -eq 400)
Check 'Password change works'                      ((Call Put '/tenants/me/password' @{ current='test1234'; next='newpass99' } $t).Status -eq 200)
Check 'Login works with the new password'          ([bool](Login 'tenant' $email 'newpass99'))
Check 'Move-out request sets pending status'       ((Call Post '/tenants/me/move-out' @{ date='2026-12-31'; reason='Relocating' } $t).Body.status -eq 'move-out-pending')

# --- deactivate ---
$d = Call Post "/tenants/$id/deactivate" $null $admin
Check 'Deactivate sets inactive and clears room'   ($d.Body.status -eq 'inactive' -and -not $d.Body.room)
Check 'Their room is freed'                        ((Call Get '/rooms/R-202' $null $admin).Body.status -eq 'available')
Check 'Deactivated tenant cannot log in (403)'     ((Call Post '/auth/login' @{ role='tenant'; identifier=$email; password='newpass99' }).Status -eq 403)

Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }