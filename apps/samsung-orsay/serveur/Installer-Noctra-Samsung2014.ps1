# Noctra pour Samsung Smart TV 2014 : serveur d'installation Windows (sans Node.js).
# Sert widgetlist.xml et Noctra.zip sur le port 80 pour « User App Sync ».
# Clic droit > « Exécuter avec PowerShell », ou double-clic sur « Installer sur le televiseur.cmd ».
$ErrorActionPreference = 'Stop'
$kit = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $kit 'Noctra.zip'
if (-not (Test-Path $archive)) { Write-Host "Noctra.zip introuvable dans $kit" -ForegroundColor Red; Read-Host 'Entrée pour fermer'; exit 1 }

# Le port 80 demande les droits d'administrateur : relance élevée si besoin.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

# Pare-feu : le téléviseur doit pouvoir joindre ce PC sur le port 80. Windows classe
# souvent le réseau de la maison en « Public » : règle valable pour tous les profils,
# mais seulement pour les appareils du réseau local.
try {
  Get-NetFirewallRule -DisplayName 'Noctra installation TV' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName 'Noctra installation TV' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
  Write-Host 'Pare-feu Windows : port 80 ouvert pour le réseau local.'
} catch { Write-Host "Règle de pare-feu non créée : autorisez le port 80 si le téléviseur ne trouve pas le PC." -ForegroundColor Yellow }
try {
  foreach ($profile in Get-NetConnectionProfile) { Write-Host ("Réseau « {0} » : profil {1}" -f $profile.Name, $profile.NetworkCategory) }
} catch {}
# Un autre pare-feu (antivirus) peut bloquer aussi : à désactiver le temps de l'installation.

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://+:80/')
try { $listener.Start() } catch {
  Write-Host "Impossible d'ouvrir le port 80 : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Un autre programme l'utilise peut-être (Skype, IIS, serveur web) : fermez-le puis relancez."
  Read-Host 'Entrée pour fermer'; exit 1
}
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress
Write-Host ''
Write-Host 'Serveur d''installation Noctra prêt (port 80).' -ForegroundColor Green
Write-Host 'Sur le téléviseur, dans « IP Setting », saisissez l''adresse de ce PC :'
foreach ($ip in $ips) { Write-Host "    $ip" -ForegroundColor Cyan }
Write-Host 'puis « Start User App Sync ». Fermez cette fenêtre une fois l''installation terminée.'
Write-Host ''
Write-Host 'Vérification : sur un téléphone connecté au même Wi-Fi, ouvrez dans le navigateur' -ForegroundColor Yellow
foreach ($ip in $ips) { Write-Host "    http://$ip/widgetlist.xml" -ForegroundColor Cyan }
Write-Host 'Une page de texte (XML) doit s''afficher. Sinon, le téléviseur ne peut pas joindre ce PC non plus.' -ForegroundColor Yellow
Write-Host 'Chaque demande reçue s''affiche ci-dessous. Rien pendant « User App Sync » = le téléviseur ne joint pas ce PC.'
Write-Host ''

$size = (Get-Item $archive).Length
while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  $path = $request.Url.AbsolutePath
  Write-Host ("{0}  {1}  {2} {3}" -f (Get-Date -Format 'HH:mm:ss'), $request.RemoteEndPoint.Address, $request.HttpMethod, $path)
  try {
    if ($path -match 'widgetlist\.xml$') {
      $hostName = $request.Url.Host
      $xml = "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`r`n<rsp stat=`"ok`">`r`n  <list>`r`n    <widget id=`"Noctra`">`r`n      <title>Noctra</title>`r`n      <compression size=`"$size`" type=`"zip`"/>`r`n      <description>Noctra pour Samsung Smart TV 2014</description>`r`n      <download>http://$hostName/Noctra.zip</download>`r`n    </widget>`r`n  </list>`r`n</rsp>`r`n"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($xml)
      $response.ContentType = 'text/xml; charset=utf-8'
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host '            liste envoyée : le téléviseur va télécharger Noctra.zip'
    } elseif ($path -match '/Noctra\.zip$') {
      $bytes = [System.IO.File]::ReadAllBytes($archive)
      $response.ContentType = 'application/zip'
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host '            Noctra.zip envoyé : attendez la fin de l''installation sur le téléviseur.' -ForegroundColor Green
    } else {
      $response.StatusCode = 404
    }
  } catch { Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red }
  $response.Close()
}
