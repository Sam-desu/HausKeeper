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
$carm  = (Login 'tenant' 'carmela.calonzo@gmail.com' 'carmela123').token
$future = (Get-Date).AddDays(14).ToString('yyyy-MM-dd')

Call Delete '/rooms/R-MAP1' $null $admin | Out-Null   # leftover from a failed earlier run

# ================= public read =================
$m = Call Get '/map'
Check 'Map is publicly readable'                      ($m.Status -eq 200 -and $m.Body.rooms.Count -ge 10)
Check 'Every room has a polygon'                      (($m.Body.rooms | Where-Object { $_.plan.Count -lt 6 }).Count -eq 0)
Check 'Tenant field is never exposed'                 (($m.Body.rooms | Where-Object { $_.PSObject.Properties.Name -contains 'tenant' }).Count -eq 0)
Check 'Floor list is returned'                        ($m.Body.floors -contains 1 -and $m.Body.floors -contains 3)
$f1 = Call Get '/map?floor=1'
Check 'Floor filter works'                            ($f1.Body.rooms.Count -ge 4 -and ($f1.Body.rooms | Where-Object { $_.floor -ne 1 }).Count -eq 0)
Check 'Invalid floor rejected (400)'                  ((Call Get '/map?floor=abc').Status -eq 400)
$r101 = $m.Body.rooms | Where-Object { $_.id -eq 'R-101' }
Check 'Map status matches the room''s real status'    ($r101.status -eq (Call Get '/rooms/R-101').Body.status)

# ================= live status =================
$tmail = "map$(Get-Random)@example.com"
$t = (Call Post '/tenants' @{ name = 'Map Test'; email = $tmail } $admin).Body
$tTok = (Login 'tenant' $tmail 'welcome123').token
$rs = Call Post '/reservations' @{ room = 'R-102'; date = $future } $tTok
Check 'Reserving a room turns it reserved on the map' (((Call Get '/map').Body.rooms | Where-Object { $_.id -eq 'R-102' }).status -eq 'reserved')
Call Post "/reservations/mine/$($rs.Body.id)/cancel" $null $tTok | Out-Null
Check 'Cancelling turns it available again'           (((Call Get '/map').Body.rooms | Where-Object { $_.id -eq 'R-102' }).status -eq 'available')
Call Post "/tenants/$($t.id)/deactivate" $null $admin | Out-Null

# ================= saving outlines =================
Call Post '/rooms' @{ id = 'R-MAP1'; floor = 5; type = 'Single'; beds = 1; price = 5000 } $admin | Out-Null
$sq = @(80, 80, 240, 80, 240, 240, 80, 240)

Check 'No token cannot save an outline (401)'         ((Call Put '/map/R-MAP1' @{ points = $sq }).Status -eq 401)
Check 'Front desk (no rooms perm) blocked (403)'      ((Call Put '/map/R-MAP1' @{ points = $sq } $front).Status -eq 403)
Check 'Tenant blocked (403)'                          ((Call Put '/map/R-MAP1' @{ points = $sq } $carm).Status -eq 403)
Check 'Unknown room rejected (404)'                   ((Call Put '/map/R-NOPE' @{ points = $sq } $admin).Status -eq 404)

Check 'Odd number of coordinates rejected (400)'      ((Call Put '/map/R-MAP1' @{ points = @(80, 80, 240, 80, 240) } $admin).Status -eq 400)
Check 'Fewer than 3 corners rejected (400)'           ((Call Put '/map/R-MAP1' @{ points = @(80, 80, 240, 80) } $admin).Status -eq 400)
Check 'Negative coordinates rejected (400)'           ((Call Put '/map/R-MAP1' @{ points = @(-40, 80, 240, 80, 240, 240) } $admin).Status -eq 400)
Check 'Text coordinates rejected (400)'               ((Call Put '/map/R-MAP1' @{ points = @('a', 'b', 240, 80, 240, 240) } $admin).Status -eq 400)
Check 'Out-of-range coordinates rejected (400)'       ((Call Put '/map/R-MAP1' @{ points = @(80, 80, 9000, 80, 240, 240) } $admin).Status -eq 400)
Check 'Flat outline with no area rejected (400)'      ((Call Put '/map/R-MAP1' @{ points = @(80, 80, 160, 80, 240, 80) } $admin).Status -eq 400)
Check 'Self-crossing bow-tie rejected (400)'          ((Call Put '/map/R-MAP1' @{ points = @(80, 80, 240, 240, 240, 80, 80, 240) } $admin).Status -eq 400)
Check 'More than 50 corners rejected (400)'           ((Call Put '/map/R-MAP1' @{ points = @(1..102 | ForEach-Object { 80 }) } $admin).Status -eq 400)

$ok = Call Put '/map/R-MAP1' @{ points = $sq } $admin
Check 'Admin saves a valid outline'                   ($ok.Status -eq 200 -and $ok.Body.id -eq 'R-MAP1' -and $ok.Body.plan.Count -eq 8)
Check 'It appears on that floor''s map'               ((Call Get '/map?floor=5').Body.rooms.id -contains 'R-MAP1')
Check 'The public room endpoint includes the plan'    ((Call Get '/rooms/R-MAP1').Body.plan.Count -eq 8)
Check 'Saving again replaces the outline'             ((Call Put '/map/R-MAP1' @{ points = @(80, 80, 240, 80, 160, 200) } $admin).Body.plan.Count -eq 6)
$edit = Call Put '/rooms/R-MAP1' @{ notes = 'edited'; plan = @(0, 0, 1, 1, 2, 0) } $admin
Check 'The room form cannot overwrite the outline'    ($edit.Body.notes -eq 'edited' -and $edit.Body.plan.Count -eq 6)

# ================= removing outlines =================
Check 'No token cannot remove an outline (401)'       ((Call Delete '/map/R-MAP1').Status -eq 401)
Check 'Front desk cannot remove an outline (403)'     ((Call Delete '/map/R-MAP1' $null $front).Status -eq 403)
$del = Call Delete '/map/R-MAP1' $null $admin
Check 'Admin removes the outline, room is kept'       ($del.Status -eq 200 -and $del.Body.id -eq 'R-MAP1' -and $null -eq $del.Body.plan)
Check 'It is gone from the map'                       ((Call Get '/map?floor=5').Body.rooms.id -notcontains 'R-MAP1')
Check 'Removing from an unknown room returns 404'     ((Call Delete '/map/R-NOPE' $null $admin).Status -eq 404)

Call Delete '/rooms/R-MAP1' $null $admin | Out-Null   # cleanup
Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }