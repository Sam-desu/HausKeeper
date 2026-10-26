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

$adm    = Login 'staff' 'admin' 'admin123'
$admin  = $adm.token
$front  = (Login 'staff' 'staff' 'staff123').token
$carm   = Login 'tenant' 'carmela.calonzo@gmail.com' 'carmela123'
$tTok   = $carm.token
$carmId = $carm.user.id

# --- access control ---
Check 'No token cannot list tickets (401)'         ((Call Get '/tickets').Status -eq 401)
Check 'Tenant cannot list all tickets (403)'       ((Call Get '/tickets' $null $tTok).Status -eq 403)
Check 'Front desk (has maintenance) can list'      ((Call Get '/tickets' $null $front).Status -eq 200)

# --- listing ---
$all = Call Get '/tickets' $null $admin
Check 'Seeded tickets are present'                 ($all.Body.Count -ge 4)
$open = Call Get '/tickets?status=open' $null $admin
Check 'Status filter returns only open tickets'    ($open.Body.Count -ge 2 -and ($open.Body | Where-Object { $_.status -ne 'open' }).Count -eq 0)
$mine = Call Get '/tickets/mine' $null $tTok
Check 'Tenant sees only their own tickets'         ($mine.Body.Count -ge 1 -and ($mine.Body | Where-Object { $_.tenant -ne $carmId }).Count -eq 0)

# --- filing ---
$new = Call Post '/tickets' @{ title='Ceiling light flickering'; category='Electrical'; priority='high'; notes='Bedroom' } $tTok
Check 'Tenant files a ticket'                      ($new.Status -eq 200 -and $new.Body.id -match '^MT-\d+$' -and $new.Body.status -eq 'open' -and $new.Body.room -eq 'R-101' -and -not $new.Body.assigned)
$tid = $new.Body.id
Check 'Empty title rejected (400)'                 ((Call Post '/tickets' @{ title='  ' } $tTok).Status -eq 400)
Check 'Invalid category rejected (400)'            ((Call Post '/tickets' @{ title='X'; category='Magic' } $tTok).Status -eq 400)
$noRoomEmail = "noroom$(Get-Random)@example.com"
Call Post '/tenants' @{ name='No Room'; email=$noRoomEmail } $admin | Out-Null
$noRoomTok = (Login 'tenant' $noRoomEmail 'welcome123').token
Check 'Tenant without a room cannot file (400)'    ((Call Post '/tickets' @{ title='X' } $noRoomTok).Status -eq 400)
Check 'Tenant cannot update tickets (403)'         ((Call Patch "/tickets/$tid" @{ status='resolved' } $tTok).Status -eq 403)

# --- assignment ---
$list = Call Get '/tickets/assignees' $null $admin
Check 'Assignee list includes Admin'               ($list.Status -eq 200 -and $list.Body.name -contains 'Admin')
$a = Call Patch "/tickets/$tid" @{ assigned=$adm.user.id } $admin
Check 'Assigning an open ticket starts it'         ($a.Body.status -eq 'in-progress' -and $a.Body.assigned -eq $adm.user.id -and $a.Body.assignedName -eq 'Admin')
Check 'Tenant sees who it was assigned to'         ((Call Get '/tickets/mine' $null $tTok).Body | Where-Object { $_.id -eq $tid } | ForEach-Object { $_.assignedName -eq 'Admin' })
Check 'Unknown staff member rejected (404)'        ((Call Patch "/tickets/$tid" @{ assigned='64b000000000000000000000' } $admin).Status -eq 404)

# --- status, notes, unassign ---
Check 'Invalid status rejected (400)'              ((Call Patch "/tickets/$tid" @{ status='done' } $admin).Status -eq 400)
Check 'Notes are saved'                            ((Call Patch "/tickets/$tid" @{ notes='Replaced the bulb' } $admin).Body.notes -eq 'Replaced the bulb')
Check 'Staff can resolve a ticket'                 ((Call Patch "/tickets/$tid" @{ status='resolved' } $admin).Body.status -eq 'resolved')
$u = Call Patch "/tickets/$tid" @{ assigned='' } $admin
Check 'Unassigning clears assignee, keeps status'  (-not $u.Body.assigned -and $u.Body.status -eq 'resolved')

# --- single ticket ---
$one = Call Get "/tickets/$tid" $null $admin
Check 'Staff can read one ticket with tenant name' ($one.Body.tenantName -eq 'Carmela Calonzo' -and $one.Body.tenant -eq $carmId)
Check 'Tenant cannot use the staff route (403)'    ((Call Get "/tickets/$tid" $null $tTok).Status -eq 403)
Check 'Unknown ticket returns 404'                 ((Call Patch '/tickets/MT-0000' @{ status='open' } $admin).Status -eq 404)

Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }