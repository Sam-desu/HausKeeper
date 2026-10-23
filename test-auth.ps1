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

$room = @{ id = 'R-TEST'; floor = 9; type = 'Single'; beds = 1; price = 5000 }

# --- login ---
$admin = Call Post '/auth/login' @{ role='staff'; identifier='admin'; password='admin123' }
Check 'Admin can log in'                        ($admin.Status -eq 200 -and $admin.Body.token)
Check 'Password is NOT in the response'         ($admin.Body.user.PSObject.Properties.Name -notcontains 'password')
Check 'Wrong password is rejected (401)'        ((Call Post '/auth/login' @{ role='staff'; identifier='admin'; password='nope' }).Status -eq 401)
Check 'Unknown user is rejected (401)'          ((Call Post '/auth/login' @{ role='staff'; identifier='ghost'; password='x' }).Status -eq 401)
Check 'Empty fields are rejected (400)'         ((Call Post '/auth/login' @{ role='staff'; identifier=''; password='' }).Status -eq 400)

# --- sessions ---
Check '/me works with a valid token'            ((Call Get '/auth/me' $null $admin.Body.token).Status -eq 200)
Check '/me blocks a missing token (401)'        ((Call Get '/auth/me').Status -eq 401)
Check '/me blocks a fake token (401)'           ((Call Get '/auth/me' $null 'abc.def.ghi').Status -eq 401)

# --- public room listing ---
$rooms = Call Get '/rooms'
Check 'Rooms are publicly readable'             ($rooms.Status -eq 200 -and $rooms.Body.Count -gt 0)
Check 'Public view hides the tenant field'      ($rooms.Body[0].PSObject.Properties.Name -notcontains 'tenant')
$staffView = Call Get '/rooms' $null $admin.Body.token
Check 'Staff view includes the tenant field'    ($staffView.Body[0].PSObject.Properties.Name -contains 'tenant')

# --- permissions ---
Check 'No token cannot create a room (401)'     ((Call Post '/rooms' $room).Status -eq 401)

$front = Call Post '/auth/login' @{ role='staff'; identifier='staff'; password='staff123' }
Check 'Front desk (no "rooms" perm) blocked (403)' ((Call Post '/rooms' $room $front.Body.token).Status -eq 403)

$tenant = Call Post '/auth/login' @{ role='tenant'; identifier='carmela.calonzo@gmail.com'; password='carmela123' }
Check 'Tenant can log in'                       ($tenant.Status -eq 200)
Check 'Tenant cannot create a room (403)'       ((Call Post '/rooms' $room $tenant.Body.token).Status -eq 403)

Check 'Admin can create a room'                 ((Call Post '/rooms' $room $admin.Body.token).Status -eq 200)
Check 'Admin can delete it (cleanup)'           ((Call Delete '/rooms/R-TEST' $null $admin.Body.token).Status -eq 200)

# --- registration ---
Check 'Duplicate email registration blocked (409)' ((Call Post '/auth/register' @{ name='X'; email='carmela.calonzo@gmail.com'; pass='abcd' }).Status -eq 409)
Check 'Short password registration blocked (400)'  ((Call Post '/auth/register' @{ name='X'; email='new@test.com'; pass='1' }).Status -eq 400)

Write-Host ""
if ($script:fails -eq 0) { Write-Host 'All checks passed.' -ForegroundColor Green }
else { Write-Host "$script:fails check(s) failed." -ForegroundColor Red }