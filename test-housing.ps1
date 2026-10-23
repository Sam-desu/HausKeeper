$base = 'http://localhost:5000/api'
$script:fails = 0
$tmp = Join-Path $env:TEMP 'hk-upload-test'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

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
function Download($path, $token) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$base$path" -Headers @{ Authorization = "Bearer $token" }
    return @{ Status = 200; Res = $r }
  } catch { return @{ Status = [int]$_.Exception.Response.StatusCode; Res = $null } }
}
function Upload($path, $fields, $file, $token) {
  $out = Join-Path $tmp 'out.json'
  $a = @('-s', '-X', 'PUT', '-H', "Authorization: Bearer $token", '-o', $out, '-w', '%{http_code}')
  foreach ($k in $fields.Keys) { $a += @('-F', "$k=$($fields[$k])") }
  if ($file) { $a += @('-F', "idFile=@$file") }
  $a += "$base$path"
  $code = & curl.exe @a
  $body = $null
  try { $body = Get-Content $out -Raw | ConvertFrom-Json } catch {}
  return @{ Status = [int]$code; Body = $body }
}

# ---- test files: PNG signature, fake image, oversized ----
$png = Join-Path $tmp 'id.png'
$bytes = [byte[]]::new(72); $bytes[0] = 0x89; $bytes[1] = 0x50; $bytes[2] = 0x4E; $bytes[3] = 0x47
[IO.File]::WriteAllBytes($png, $bytes)
$fake = Join-Path $tmp 'fake.png'
[IO.File]::WriteAllText($fake, 'this is not an image')
$big = Join-Path $tmp 'big.png'
$bigBytes = [byte[]]::new(6MB); $bigBytes[0] = 0x89; $bigBytes[1] = 0x50; $bigBytes[2] = 0x4E; $bigBytes[3] = 0x47
[IO.File]::WriteAllBytes($big, $bigBytes)

# ---- setup ----
$admin = (Login 'staff' 'admin' 'admin123').token
$front = (Login 'staff' 'staff' 'staff123').token
function NewTenant($label) {
  $email = "$label$(Get-Random)@example.com"
  $t = (Call Post '/tenants' @{ name = "Test $label"; email = $email } $admin).Body
  return @{ Id = $t.id; Email = $email; Token = (Login 'tenant' $email 'welcome123').token }
}
$A = NewTenant 'resa'; $B = NewTenant 'resb'; $C = NewTenant 'resc'
$future = (Get-Date).AddDays(14).ToString('yyyy-MM-dd')

# ================= reservations =================
$res = @{ room = 'R-102'; date = $future; lease = '12 months'; requests = 'Ground floor' }
Check 'No token cannot reserve (401)'                 ((Call Post '/reservations' $res).Status -eq 401)
Check 'Staff cannot reserve (403)'                    ((Call Post '/reservations' $res $admin).Status -eq 403)
Check 'Past move-in date rejected (400)'              ((Call Post '/reservations' @{ room='R-102'; date='2020-01-01' } $A.Token).Status -eq 400)
Check 'Invalid lease rejected (400)'                  ((Call Post '/reservations' @{ room='R-102'; date=$future; lease='3 days' } $A.Token).Status -eq 400)
Check 'Unknown room rejected (404)'                   ((Call Post '/reservations' @{ room='R-NOPE'; date=$future } $A.Token).Status -eq 404)
Check 'Occupied room rejected (409)'                  ((Call Post '/reservations' @{ room='R-101'; date=$future } $A.Token).Status -eq 409)

$r1 = Call Post '/reservations' $res $A.Token
$rid = $r1.Body.id
Check 'Tenant reserves an available room (48h hold)'  ($r1.Status -eq 200 -and $r1.Body.status -eq 'pending' -and $r1.Body.id -match '^RS-\d+$' -and ([datetime]$r1.Body.holdUntil) -gt (Get-Date).AddHours(47))
$rm = (Call Get '/rooms/R-102' $null $admin).Body
Check 'Room is now reserved for that tenant'          ($rm.status -eq 'reserved' -and $rm.tenant -eq $A.Id)
Check 'Reserved room is no longer listed as available' ((Call Get '/rooms?status=available').Body.id -notcontains 'R-102')
$s = (Call Get '/reports/summary' $null $admin).Body
Check 'Reports count reserved rooms and still add up' ($s.rooms.reserved -ge 1 -and ($s.rooms.occupied + $s.rooms.reserved + $s.rooms.available + $s.rooms.maintenance) -eq $s.rooms.total)
Check 'Second pending reservation rejected (409)'     ((Call Post '/reservations' @{ room='R-204'; date=$future } $A.Token).Status -eq 409)
Check 'Someone else cannot take the held room (409)'  ((Call Post '/reservations' @{ room='R-102'; date=$future } $B.Token).Status -eq 409)
Check 'Tenant sees their own reservation'             ((Call Get '/reservations/mine' $null $A.Token).Body.room -eq 'R-102')
Check 'Other tenants do not see it'                   ((Call Get '/reservations/mine' $null $B.Token).Body.Count -eq 0)
Check 'Tenant cannot list all reservations (403)'     ((Call Get '/reservations' $null $A.Token).Status -eq 403)
Check 'No token cannot list reservations (401)'       ((Call Get '/reservations').Status -eq 401)
$row = (Call Get '/reservations' $null $front).Body | Where-Object { $_.id -eq $rid }
Check 'Front desk lists them with name + form status' ($row.tenantName -eq 'Test resa' -and $row.PSObject.Properties.Name -contains 'moveInStatus')
$pend = Call Get '/reservations?status=pending' $null $admin
Check 'Status filter works'                           ($pend.Body.Count -ge 1 -and ($pend.Body | Where-Object { $_.status -ne 'pending' }).Count -eq 0)

Check 'Cannot cancel someone else''s reservation (404)' ((Call Post "/reservations/mine/$rid/cancel" $null $B.Token).Status -eq 404)
Check 'Tenant cancels their own reservation'          ((Call Post "/reservations/mine/$rid/cancel" $null $A.Token).Body.status -eq 'cancelled')
$rm = (Call Get '/rooms/R-102' $null $admin).Body
Check 'Cancelling frees the room'                     ($rm.status -eq 'available' -and $null -eq $rm.tenant)
Check 'Cancelling twice rejected (409)'               ((Call Post "/reservations/mine/$rid/cancel" $null $A.Token).Status -eq 409)

$r2 = Call Post '/reservations' @{ room='R-204'; date=$future } $A.Token
Check 'Staff declines a reservation'                  ((Call Post "/reservations/$($r2.Body.id)/decline" $null $admin).Body.status -eq 'declined')
Check 'Declining frees the room'                      ((Call Get '/rooms/R-204' $null $admin).Body.status -eq 'available')
Check 'Tenant cannot decline (403)'                   ((Call Post "/reservations/$($r2.Body.id)/decline" $null $A.Token).Status -eq 403)

$r3 = Call Post '/reservations' @{ room='R-202'; date=$future; lease='6 months' } $B.Token
$ap = Call Post "/reservations/$($r3.Body.id)/approve" $null $admin
Check 'Staff approves a reservation'                  ($ap.Status -eq 200 -and $ap.Body.status -eq 'approved')
$tb = (Call Get "/tenants/$($B.Id)" $null $admin).Body
Check 'Tenant is moved in on the requested date'      ($tb.room -eq 'R-202' -and $tb.moveIn -eq $future)
$rm = (Call Get '/rooms/R-202' $null $admin).Body
Check 'Room is occupied by that tenant'               ($rm.status -eq 'occupied' -and $rm.tenant -eq $B.Id)
Check 'Approving twice rejected (409)'                ((Call Post "/reservations/$($r3.Body.id)/approve" $null $admin).Status -eq 409)
Check 'Tenant with a room cannot reserve (409)'       ((Call Post '/reservations' @{ room='R-302'; date=$future } $B.Token).Status -eq 409)
Check 'Unknown reservation returns 404'               ((Call Post '/reservations/RS-9999/approve' $null $admin).Status -eq 404)

# ================= room status guards =================
Check 'Cannot hand-edit an occupied room''s status (409)' ((Call Put '/rooms/R-202' @{ status='available' } $admin).Status -eq 409)
Check 'Cannot set "reserved" by hand (409)'           ((Call Put '/rooms/R-302' @{ status='reserved' } $admin).Status -eq 409)
Check 'New room cannot be created as occupied (400)'  ((Call Post '/rooms' @{ id='R-TEST2'; floor=9; type='Single'; beds=1; price=5000; status='occupied' } $admin).Status -eq 400)
Check 'Occupied room cannot be deleted (409)'         ((Call Delete '/rooms/R-202' $null $admin).Status -eq 409)
Check 'Saving an occupied room with same status works' ((Call Put '/rooms/R-202' @{ status='occupied'; notes='checked' } $admin).Status -eq 200)

# ================= move-out =================
Check 'Move-out needs a valid date (400)'             ((Call Post '/tenants/me/move-out' @{ reason='Relocating' } $B.Token).Status -eq 400)
$mo = Call Post '/tenants/me/move-out' @{ date=$future; reason='Relocating'; notes='New job' } $B.Token
Check 'Tenant requests a move-out'                    ($mo.Body.status -eq 'move-out-pending')
Check 'A second request is rejected (409)'            ((Call Post '/tenants/me/move-out' @{ date=$future } $B.Token).Status -eq 409)
$cn = Call Post '/tenants/me/move-out/cancel' $null $B.Token
Check 'Tenant can cancel the request'                 ($cn.Body.status -eq 'active' -and -not $cn.Body.moveOut)
Call Post '/tenants/me/move-out' @{ date=$future; reason='Relocating' } $B.Token | Out-Null
$pl = Call Get '/tenants?status=move-out-pending' $null $admin
Check 'Staff sees it in the pending list'             (($pl.Body | Where-Object { $_.id -eq $B.Id }).moveOut.reason -eq 'Relocating')
Check 'Tenant cannot complete a move-out (403)'       ((Call Post "/tenants/$($B.Id)/move-out/complete" $null $B.Token).Status -eq 403)
Check 'Staff declines the request'                    ((Call Post "/tenants/$($B.Id)/move-out/decline" $null $admin).Body.status -eq 'active')
Call Post '/tenants/me/move-out' @{ date=$future } $B.Token | Out-Null
Call Post '/invoices' @{ tenant=$B.Id; period='Move-out test'; due=$future; amount=100 } $admin | Out-Null
Check 'Unpaid invoices block completion (409)'        ((Call Post "/tenants/$($B.Id)/move-out/complete" $null $admin).Status -eq 409)
$done = Call Post "/tenants/$($B.Id)/move-out/complete" @{ force = $true } $admin
Check 'Staff completes the move-out with force'       ($done.Status -eq 200 -and $done.Body.status -eq 'active' -and -not $done.Body.room)
Check 'The room is freed'                             ((Call Get '/rooms/R-202' $null $admin).Body.status -eq 'available')
Check 'Tenant can still log in afterwards'            ([bool](Login 'tenant' $B.Email 'welcome123').token)
Check 'Completing with no pending request fails (409)' ((Call Post "/tenants/$($B.Id)/move-out/complete" $null $admin).Status -eq 409)

# ================= move-in form =================
$fields = @{
  legalName = 'Test Person'; dob = '1999-05-04'; phone = '0999 000 1111'; govId = 'PhilID 0000-0000'
  emergencyName = 'Test Mom'; emergencyRelationship = 'Mother'; emergencyPhone = '0917 000 0000'; agreed = 'true'
}
$noAgree = $fields.Clone(); $noAgree.Remove('agreed')

$mine = Call Get '/move-in/mine' $null $C.Token
Check 'No form yet returns null'                      ($mine.Status -eq 200 -and $null -eq $mine.Body)
Check 'Missing agreement rejected (400)'              ((Upload '/move-in/mine' $noAgree $png $C.Token).Status -eq 400)
Check 'Missing ID file rejected (400)'                ((Upload '/move-in/mine' $fields $null $C.Token).Status -eq 400)
Check 'Non-image upload rejected (400)'               ((Upload '/move-in/mine' $fields $fake $C.Token).Status -eq 400)
Check 'Oversized upload rejected (413)'               ((Upload '/move-in/mine' $fields $big $C.Token).Status -eq 413)
$u = Upload '/move-in/mine' $fields $png $C.Token
$fid = $u.Body.id
Check 'Valid form is accepted'                        ($u.Status -eq 200 -and $u.Body.status -eq 'submitted' -and $u.Body.hasId)
Check 'Server never exposes the stored file name'     ($u.Body.PSObject.Properties.Name -notcontains 'idFile')
Check 'Tenant reads their own form'                   ((Call Get '/move-in/mine' $null $C.Token).Body.legalName -eq 'Test Person')
Check 'Tenant cannot list all forms (403)'            ((Call Get '/move-in' $null $C.Token).Status -eq 403)
$lst = Call Get '/move-in' $null $admin
Check 'Staff lists forms with tenant names'           (($lst.Body | Where-Object { $_.id -eq $fid }).tenantName -eq 'Test resc')
$d = Download "/move-in/$fid/id-file" $admin
Check 'Staff downloads the ID with the right type'    ($d.Status -eq 200 -and "$($d.Res.Headers['Content-Type'])" -match 'image/png' -and $d.Res.Content[0] -eq 0x89)
Check 'Tenant cannot use the staff download (403)'    ((Download "/move-in/$fid/id-file" $C.Token).Status -eq 403)
$again = Upload '/move-in/mine' $fields $null $C.Token
Check 'Resubmitting without a file keeps the old ID'  ($again.Status -eq 200 -and $again.Body.hasId)
Check 'Rejecting needs a note (400)'                  ((Call Post "/move-in/$fid/review" @{ decision='rejected' } $admin).Status -eq 400)
$rej = Call Post "/move-in/$fid/review" @{ decision='rejected'; note='Photo is blurry' } $admin
Check 'Staff rejects with a note'                     ($rej.Body.status -eq 'rejected' -and $rej.Body.reviewNote -eq 'Photo is blurry')
$seen = (Call Get '/move-in/mine' $null $C.Token).Body
Check 'Tenant sees the rejection reason'              ($seen.status -eq 'rejected' -and $seen.reviewNote -eq 'Photo is blurry')
Check 'Resubmitting returns it to "submitted"'        ((Upload '/move-in/mine' $fields $png $C.Token).Body.status -eq 'submitted')
Check 'Invalid decision rejected (400)'               ((Call Post "/move-in/$fid/review" @{ decision='maybe' } $admin).Status -eq 400)
Check 'Staff approves the form'                       ((Call Post "/move-in/$fid/review" @{ decision='approved' } $admin).Body.status -eq 'approved')
Check 'Approval copies the emergency contact over'    ((Call Get "/tenants/$($C.Id)" $null $admin).Body.emergency -match 'Test Mom')
Check 'An approved form cannot be changed (409)'      ((Upload '/move-in/mine' $fields $png $C.Token).Status -eq 409)

# ================= deactivation releases holds =================
$r4 = Call Post '/reservations' @{ room='R-302'; date=$future } $C.Token
Check 'Tenant holds a room'                           ($r4.Status -eq 200)
Check 'A reserved room cannot be deleted (409)'       ((Call Delete '/rooms/R-302' $null $admin).Status -eq 409)
Call Post "/tenants/$($C.Id)/deactivate" $null $admin | Out-Null
Check 'Deactivating a tenant cancels their hold'      ((Call Get '/rooms/R-302' $null $admin).Body.status -eq 'available' -and (Call Get '/reservations?status=cancelled' $null $admin).Body.id -contains $r4.Body.id)

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }