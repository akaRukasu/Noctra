[CmdletBinding()]
param(
    [string]$DownloadsPath = (Join-Path $env:USERPROFILE 'Downloads'),
    [string]$RemoteHost = 'astra.usbx.me',
    [string]$OldRemoteHost = 'merlion.usbx.me',
    [string]$RemoteUser = 'akarukasu',
    [int]$SshPort = 22,
    [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\noctra_ultracc_ed25519_v6'),
    [switch]$Force,
    [switch]$SkipKeySetup,
    [switch]$ResetSshKey,
    [string]$EnvFile = '',
    [switch]$Diagnostic,
    [switch]$Repair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:NoctraUpdaterVersion = '8.5'
$script:LastSshDiagnostic = ''

function Write-Step {
    param([string]$Message)
    Write-Host "`n[Noctra] $Message" -ForegroundColor Cyan
}

function Stop-WithError {
    param([string]$Message)
    Write-Host "`n[Erreur] $Message" -ForegroundColor Red
    throw $Message
}

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Stop-WithError "La commande '$Name' est introuvable. Active le client OpenSSH de Windows puis relance le script."
    }
}

function ConvertTo-NativeCommandLine {
    param([string[]]$Arguments)

    $quoted = foreach ($argument in $Arguments) {
        if ($null -eq $argument -or $argument.Length -eq 0) {
            '""'
            continue
        }

        if ($argument -notmatch '[\s"]') {
            $argument
            continue
        }

        # Echappement compatible avec CommandLineToArgvW. Cette fonction est
        # surtout utile si le profil Windows contient un espace.
        $builder = New-Object System.Text.StringBuilder
        [void]$builder.Append('"')
        $backslashes = 0

        foreach ($character in $argument.ToCharArray()) {
            if ($character -eq '\') {
                $backslashes++
                continue
            }

            if ($character -eq '"') {
                [void]$builder.Append(('\' * (($backslashes * 2) + 1)))
                [void]$builder.Append('"')
                $backslashes = 0
                continue
            }

            if ($backslashes -gt 0) {
                [void]$builder.Append(('\' * $backslashes))
                $backslashes = 0
            }
            [void]$builder.Append($character)
        }

        if ($backslashes -gt 0) {
            [void]$builder.Append(('\' * ($backslashes * 2)))
        }
        [void]$builder.Append('"')
        $builder.ToString()
    }

    return ($quoted -join ' ')
}

function Invoke-NativeQuiet {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [int]$TimeoutSeconds = 30
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.Arguments = ConvertTo-NativeCommandLine -Arguments $Arguments

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()

    # IMPORTANT V7 : on commence a lire stdout et stderr AVANT d'attendre la
    # fin du processus. Dans la V6, ssh -vvv remplissait le tampon stderr ;
    # WaitForExit attendait alors ssh, tandis que ssh attendait que le tampon
    # soit lu. Le faux timeout de 20 secondes provenait de ce deadlock.
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    $timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
    if ($timedOut) {
        try { $process.Kill() } catch {}
        try { $process.WaitForExit() } catch {}
    }
    else {
        # Permet aux lectures asynchrones de recuperer les derniers octets.
        $process.WaitForExit()
    }

    try { [void]$stdoutTask.Wait(5000) } catch {}
    try { [void]$stderrTask.Wait(5000) } catch {}

    $stdout = if ($stdoutTask.IsCompleted) { [string]$stdoutTask.Result } else { '' }
    $stderr = if ($stderrTask.IsCompleted) { [string]$stderrTask.Result } else { '' }

    if ($timedOut) {
        if (-not [string]::IsNullOrWhiteSpace($stderr)) {
            $stderr += [Environment]::NewLine
        }
        $stderr += "La commande a depasse le delai de $TimeoutSeconds secondes."
        return [pscustomobject]@{
            ExitCode = 124
            StdOut   = $stdout
            StdErr   = $stderr
        }
    }

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        StdOut   = $stdout
        StdErr   = $stderr
    }
}

function New-NoctraSshKey {
    param([string]$KeyFile)

    $keyDirectory = Split-Path -Parent $KeyFile
    $publicKeyFile = "$KeyFile.pub"

    if (-not (Test-Path -LiteralPath $keyDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
    }

    Remove-Item -LiteralPath $KeyFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $publicKeyFile -Force -ErrorAction SilentlyContinue

    $keygenPath = (Get-Command 'ssh-keygen.exe' -ErrorAction Stop).Source
    $comment = "noctra-updater@$env:COMPUTERNAME"
    $tempCmd = Join-Path ([System.IO.Path]::GetTempPath()) ("noctra-keygen-" + [guid]::NewGuid().ToString('N') + '.cmd')

    # Windows PowerShell 5.1 transmet parfois -N '""' comme une vraie
    # passphrase composee de deux guillemets. Un petit CMD temporaire garantit
    # que -N "" arrive bien a ssh-keygen comme une passphrase vide.
    $cmdContent = @"
@echo off
"$keygenPath" -q -t ed25519 -f "$KeyFile" -N "" -C "$comment"
exit /b %errorlevel%
"@

    try {
        [System.IO.File]::WriteAllText($tempCmd, $cmdContent, [System.Text.Encoding]::ASCII)
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & cmd.exe /d /c $tempCmd
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
    }
    finally {
        Remove-Item -LiteralPath $tempCmd -Force -ErrorAction SilentlyContinue
    }

    if ($exitCode -ne 0 -or
        -not (Test-Path -LiteralPath $KeyFile -PathType Leaf) -or
        -not (Test-Path -LiteralPath $publicKeyFile -PathType Leaf)) {
        Stop-WithError "Impossible de creer la nouvelle cle SSH sans passphrase : $KeyFile"
    }
}

function Test-NoctraSshKey {
    param(
        [string]$Target,
        [string]$KeyFile,
        [switch]$VerboseDiagnostic
    )

    if (-not (Test-Path -LiteralPath $KeyFile -PathType Leaf)) {
        return $false
    }

    $arguments = @(
        '-T',
        '-p', [string]$SshPort,
        '-i', $KeyFile,
        '-o', 'IdentitiesOnly=yes',
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'PreferredAuthentications=publickey',
        '-o', 'PasswordAuthentication=no',
        '-o', 'KbdInteractiveAuthentication=no',
        '-o', 'NumberOfPasswordPrompts=0',
        '-o', 'ConnectionAttempts=1',
        '-o', 'ConnectTimeout=10',
        '-o', 'ServerAliveInterval=5',
        '-o', 'ServerAliveCountMax=1',
        $Target,
        'printf', 'NOCTRA_SSH_OK'
    )

    if ($VerboseDiagnostic) {
        $arguments = @('-vvv') + $arguments
    }
    else {
        $arguments = @('-q') + $arguments
    }

    $sshPath = (Get-Command 'ssh.exe' -ErrorAction Stop).Source
    $result = Invoke-NativeQuiet -FilePath $sshPath -Arguments $arguments -TimeoutSeconds 30
    $combinedOutput = ($result.StdOut + [Environment]::NewLine + $result.StdErr).Trim()

    if ($VerboseDiagnostic) {
        $script:LastSshDiagnostic = $combinedOutput
    }

    return ($result.ExitCode -eq 0 -and $result.StdOut -match 'NOCTRA_SSH_OK')
}

function Ensure-NoctraSshKey {
    param(
        [string]$Target,
        [string]$KeyFile
    )

    $publicKeyFile = "$KeyFile.pub"

    if ($ResetSshKey) {
        Remove-Item -LiteralPath $KeyFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $publicKeyFile -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath $KeyFile -PathType Leaf) -or
        -not (Test-Path -LiteralPath $publicKeyFile -PathType Leaf)) {
        Write-Step 'Creation d une cle SSH Noctra sans passphrase'
        New-NoctraSshKey -KeyFile $KeyFile
    }

    if (Test-NoctraSshKey -Target $Target -KeyFile $KeyFile) {
        Write-Host 'Authentification SSH sans mot de passe deja operationnelle.' -ForegroundColor Green
        return
    }

    if ($SkipKeySetup) {
        Stop-WithError "La cle SSH n'est pas encore autorisee sur Ultra.cc. Relance sans -SkipKeySetup."
    }

    Write-Step 'Configuration SSH sans mot de passe (une seule fois)'
    Write-Host 'Ultra.cc demandera ton mot de passe une derniere fois pour verifier ou installer la cle SSH Noctra.' -ForegroundColor Yellow

    $publicKey = (Get-Content -LiteralPath $publicKeyFile -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($publicKey)) {
        Stop-WithError "La cle publique est vide : $publicKeyFile"
    }

    # Transport Base64 : aucun guillemet, espace ou retour Windows ne peut
    # endommager la ligne authorized_keys. On conserve les autres cles deja
    # presentes sur le compte Ultra.cc.
    $publicKeyBytes = [System.Text.Encoding]::ASCII.GetBytes($publicKey)
    $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)
    $installKeyCommand = "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; echo $publicKeyBase64 | base64 -d >> ~/.ssh/authorized_keys; echo >> ~/.ssh/authorized_keys; chmod -R go= ~/.ssh"

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & ssh.exe `
            -T `
            -p $SshPort `
            -o 'StrictHostKeyChecking=accept-new' `
            -o 'PubkeyAuthentication=no' `
            -o 'PreferredAuthentications=password,keyboard-interactive' `
            -o 'NumberOfPasswordPrompts=3' `
            -o 'ConnectTimeout=15' `
            $Target $installKeyCommand

        $installKeyExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($installKeyExitCode -ne 0) {
        Stop-WithError "L'installation de la cle SSH Noctra sur Ultra.cc a echoue (code $installKeyExitCode)."
    }

    Start-Sleep -Milliseconds 700

    if (-not (Test-NoctraSshKey -Target $Target -KeyFile $KeyFile -VerboseDiagnostic)) {
        Stop-WithError "La cle a ete ajoutee, mais le test SSH a echoue. Le diagnostic detaille a ete ajoute au journal."
    }

    Write-Host 'Cle SSH Noctra installee : les prochaines mises a jour ne demanderont plus le mot de passe.' -ForegroundColor Green
}

# V8 : commande distante courte (test d'installation), sortie texte.
function Invoke-NoctraRemote {
    param([string]$Target, [string]$Command, [int]$TimeoutSeconds = 30)
    $sshPath = (Get-Command 'ssh.exe' -ErrorAction Stop).Source
    $arguments = @(
        '-q', '-T',
        '-p', [string]$SshPort,
        '-i', $IdentityFile,
        '-o', 'IdentitiesOnly=yes',
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=15',
        $Target, $Command
    )
    return Invoke-NativeQuiet -FilePath $sshPath -Arguments $arguments -TimeoutSeconds $TimeoutSeconds
}

# V8 : .env garde sur le PC (a cote du script), utilise seulement si Noctra
# n'est pas encore installe sur le serveur (seedbox deplacee sans le dossier).
function Find-LocalEnvFile {
    if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { Stop-WithError "Fichier .env introuvable : $EnvFile" }
        return (Get-Item -LiteralPath $EnvFile)
    }
    $found = Get-ChildItem -LiteralPath $PSScriptRoot -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq '.env' -or $_.Name -like '.env.*' -or $_.Name -like 'noctra*.env' } |
        Where-Object { $_.Name -notlike '*.example' } |
        Sort-Object -Property LastWriteTimeUtc -Descending |
        Select-Object -First 1
    return $found
}

# V8 : diagnostic du serveur (tout ce dont Noctra a besoin), lance seul
# (-Diagnostic) ou apres chaque mise a jour. Rapport enregistre a cote du
# script, sans aucune cle ni mot de passe.
$script:DiagnosticScript = @'
#!/usr/bin/env bash
# Noctra - diagnostic du serveur (V8) : tout ce dont Noctra a besoin.
# Aucune cle ni aucun mot de passe n'est affiche.
set -uo pipefail
APP_DIR="${NOCTRA_APP_DIR:-$HOME/apps/noctra}"
SERVICE_NAME="${NOCTRA_SERVICE_NAME:-noctra.service}"
OLD_HOST="${NOCTRA_OLD_HOST:-merlion.usbx.me}"
NEW_HOST="${NOCTRA_NEW_HOST:-astra.usbx.me}"
ENV_FILE="$APP_DIR/.env"
OK=0; BAD=0; WARN=0
ok()   { OK=$((OK+1));   printf '[OK] %s\n' "$*"; }
bad()  { BAD=$((BAD+1)); printf '[!!] %s\n' "$*"; }
note() { WARN=$((WARN+1)); printf '[??] %s\n' "$*"; }
info() { printf '     %s\n' "$*"; }
title() { printf '\n== %s ==\n' "$*"; }

env_value() {
  [[ -f "$ENV_FILE" ]] || return 0
  sed -nE "s/^[[:space:]]*${1}[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\\1/p" "$ENV_FILE" | tr -d '\r' | tail -n 1
}
# Code HTTP et corps (100 premiers caracteres) d'une requete, 12 s au plus.
http() {
  local out code
  out="$(curl --silent --show-error --location --max-time 12 --write-out '\n%{http_code}' "$@" 2>&1)" || true
  code="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
  CODE="$code"
}
json_field() { "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=process.argv[1].split(".").reduce((o,k)=>o==null?o:o[k],JSON.parse(s));process.stdout.write(v==null?"":String(v))}catch{}})' "$1" <<<"$BODY"; }

printf 'Diagnostic Noctra - %s - %s@%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(whoami)" "$(hostname -f 2>/dev/null || hostname)"

title "Systeme"
NODE_BIN=""
if [[ -d "$HOME/.nvm/versions/node" ]]; then
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -path '*/bin/node' -perm -u+x 2>/dev/null | sort -V | tail -n 1)"
fi
[[ -z "$NODE_BIN" ]] && NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -n "$NODE_BIN" ]]; then
  major="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if (( major >= 20 )); then ok "Node.js $("$NODE_BIN" --version) ($NODE_BIN)"; else bad "Node.js $("$NODE_BIN" --version) trop ancien : 20 ou plus necessaire (NVM : nvm install 22)"; fi
else
  bad "Node.js introuvable : installer Node.js 20+ (Ultra.cc : NVM)"
  NODE_BIN=false
fi
for tool in curl unzip systemctl; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool present"; else bad "$tool absent"; fi
done
if command -v app-nginx >/dev/null 2>&1; then ok "app-nginx present (proxy Ultra.cc)"; else bad "app-nginx absent : le proxy Ultra.cc ne peut pas etre configure"; fi
if command -v ffmpeg >/dev/null 2>&1; then ok "ffmpeg present (mosaique des chaines, conversions)"; else note "ffmpeg absent : la mosaique des chaines TV ne fonctionnera pas"; fi
free_kb="$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')"
if [[ -n "$free_kb" ]]; then
  free_gb=$(( free_kb / 1024 / 1024 ))
  if (( free_gb >= 5 )); then ok "Espace libre : ${free_gb} Go"; else note "Espace libre faible : ${free_gb} Go"; fi
fi
command -v quota >/dev/null 2>&1 && quota -s 2>/dev/null | tail -n 1 | sed 's/^/     quota : /'

title "Installation Noctra"
if [[ -d "$APP_DIR" ]]; then ok "Dossier $APP_DIR"; else bad "Dossier $APP_DIR absent : Noctra n'est pas installe sur ce serveur"; fi
if [[ -f "$APP_DIR/package.json" ]]; then
  ok "Version installee : $("$NODE_BIN" -e "process.stdout.write(String(require(process.argv[1]).version||'?'))" "$APP_DIR/package.json" 2>/dev/null)"
fi
if [[ -f "$ENV_FILE" ]]; then
  perms="$(stat -c %a "$ENV_FILE" 2>/dev/null)"
  ok ".env present (droits $perms)"
  [[ "$perms" == "600" ]] || note ".env lisible par d'autres comptes : chmod 600 $ENV_FILE"
  if grep -qiE "([/@.])${OLD_HOST//./\\.}" "$ENV_FILE"; then bad ".env contient encore l'ancien serveur ($OLD_HOST) : corrige par la reparation (REPARER-NOCTRA-V8.cmd) ou la mise a jour"; else ok ".env sans adresse de l'ancien serveur"; fi
  for key in PORT BASE_URL JELLYFIN_URL JELLYFIN_API_KEY QBITTORRENT_URL QBITTORRENT_USERNAME QBITTORRENT_PASSWORD SONARR_URL SONARR_API_KEY RADARR_URL RADARR_API_KEY PROWLARR_URL PROWLARR_API_KEY JELLYSEERR_URL JELLYSEERR_API_KEY TMDB_API_KEY; do
    if [[ -n "$(env_value "$key")" ]]; then info "$key : renseigne"; else
      case "$key" in PORT|BASE_URL|JELLYFIN_URL|JELLYFIN_API_KEY) bad "$key manquant dans .env";; *) note "$key vide : la fonction correspondante sera indisponible";; esac
    fi
  done
else
  bad ".env absent ($ENV_FILE)"
fi
PORT="$(env_value PORT)"; BASE_URL="$(env_value BASE_URL)"; BASE_URL="${BASE_URL%/}"
installed="$("$NODE_BIN" -e "process.stdout.write(String(require(process.argv[1]).version||''))" "$APP_DIR/package.json" 2>/dev/null || true)"
if [[ -n "$installed" ]] && [[ "$(printf '%s\n%s\n' "$installed" 200.0.167 | sort -V | head -n 1)" != 200.0.167 ]]; then
  note "Version $installed : mettre a jour vers 200.0.167 ou plus (LANCER-MISE-A-JOUR-NOCTRA-V8.cmd) pour les dernieres corrections"
fi
CLIENT_CONFIG="$APP_DIR/public/client/config.json"
if [[ -f "$CLIENT_CONFIG" ]]; then
  if grep -qi "${OLD_HOST//./\\.}" "$CLIENT_CONFIG"; then bad "Version web : elle cherche encore Jellyfin sur l'ancien serveur ($OLD_HOST) : lancer la reparation"; else ok "Version web : adresse de Jellyfin a jour"; fi
fi

title "Service et acces"
SERVICE_FILE="$HOME/.config/systemd/user/$SERVICE_NAME"
if [[ -f "$SERVICE_FILE" ]]; then ok "Service systemd $SERVICE_NAME"; else bad "Service systemd absent : lancer bash $APP_DIR/ultra/install-ultra.sh"; fi
# Reglage memoire WebAssembly (sinon "fetch failed" / "Cannot allocate Wasm memory").
if grep -qs -- '--disable-wasm-trap-handler' "$SERVICE_FILE" "$SERVICE_FILE.d"/*.conf; then
  ok "Service : reglage memoire WebAssembly present"
else
  note "Service : reglage memoire WebAssembly absent du service (Noctra 200.0.165+ se relance seul avec ce reglage ; la reparation l'ajoute au service)"
fi
if [[ -s "$APP_DIR/logs/noctra-error.log" ]] && tail -n 30 "$APP_DIR/logs/noctra-error.log" | grep -q 'Cannot allocate Wasm memory'; then
  bad "Noctra manque de memoire WebAssembly (Jellyfin injoignable, \"fetch failed\") : mettre a jour vers 200.0.165 ou lancer REPARER-NOCTRA-V8.cmd"
fi
state="$(systemctl --user is-active "$SERVICE_NAME" 2>/dev/null || true)"; state="${state:-inconnu}"
if [[ "$state" == active ]]; then ok "Service actif"; else bad "Service $state : systemctl --user restart $SERVICE_NAME (journal : $APP_DIR/logs/noctra-error.log)"; fi
[[ "$(systemctl --user is-enabled "$SERVICE_NAME" 2>/dev/null || true)" == enabled ]] && ok "Demarrage automatique active" || note "Demarrage automatique non active : systemctl --user enable $SERVICE_NAME"
NGINX_FILE="$HOME/.apps/nginx/proxy.d/noctra.conf"
if [[ -f "$NGINX_FILE" ]]; then
  if [[ -n "$PORT" ]] && grep -q "127.0.0.1:$PORT" "$NGINX_FILE"; then ok "Proxy Ultra.cc vers le port $PORT"; else bad "Proxy Ultra.cc ne pointe pas vers le port $PORT : relancer install-ultra.sh"; fi
else
  bad "Proxy Ultra.cc absent ($NGINX_FILE) : relancer install-ultra.sh"
fi
if [[ -n "$PORT" ]]; then
  http "http://127.0.0.1:${PORT}${BASE_URL}/health"
  if [[ "$CODE" == 200 && "$BODY" == *'"status":"ok"'* ]]; then ok "Noctra repond en local (version $(json_field version))"; else bad "Noctra ne repond pas en local (http://127.0.0.1:${PORT}${BASE_URL}/health, code $CODE)"; fi
fi
PUBLIC="https://$(whoami).${NEW_HOST}${BASE_URL}/health"
http "$PUBLIC"
if [[ "$CODE" == 200 && "$BODY" == *'"status":"ok"'* ]]; then ok "Noctra repond depuis Internet ($PUBLIC)"; else bad "Noctra ne repond pas depuis Internet ($PUBLIC, code $CODE)"; fi
WEB="https://$(whoami).${NEW_HOST}${BASE_URL}/client/index.html"
http "$WEB"
if [[ "$CODE" == 200 ]]; then ok "Version web accessible ($WEB)"; else bad "Version web inaccessible ($WEB, code $CODE)"; fi
# Fonctions de Noctra activees d'apres sa configuration (ce que la version web affiche).
if [[ -n "$PORT" ]]; then
  http "http://127.0.0.1:${PORT}${BASE_URL}/api/config"
  if [[ "$CODE" == 200 ]]; then
    for feature in jellyfin downloads sonarr radarr prowlarr jellyseerr discovery tmdb files; do
      value="$(json_field "configured.$feature")"
      case "$feature" in
        jellyfin) label="Jellyfin (bibliotheque)";; downloads) label="Telechargements (qBittorrent)";; sonarr) label="Series (Sonarr)";; radarr) label="Films (Radarr)";;
        prowlarr) label="Recherche de torrents (Prowlarr)";; jellyseerr) label="Demandes (Jellyseerr)";; discovery) label="Decouvrir";; tmdb) label="Fiches TMDB";; files) label="Fichiers";;
      esac
      if [[ "$value" == true ]]; then info "Fonction active : $label"; else note "Fonction desactivee : $label (reglage manquant dans .env)"; fi
    done
  fi
fi

title "Services utilises par Noctra"
JF="$(env_value JELLYFIN_URL)"; JF="${JF%/}"
if [[ -n "$JF" ]]; then
  if grep -qi "${OLD_HOST//./\\.}" <<<"$JF"; then bad "JELLYFIN_URL pointe encore sur l'ancien serveur ($JF) : lancer la reparation"; fi
  http "$JF/System/Info/Public"
  jf_up=0
  if [[ "$CODE" == 200 ]]; then jf_up=1; ok "Jellyfin joignable : $(json_field ServerName) $(json_field Version) ($JF)"; else bad "Jellyfin injoignable ($JF, code $CODE)"; fi
  key="$(env_value JELLYFIN_API_KEY)"
  # Requete faite comme Noctra (Node.js) : cause exacte d'un "fetch failed".
  jf_node="$("$NODE_BIN" -e 'fetch(process.argv[1],{signal:AbortSignal.timeout(10000)}).then(r=>console.log("HTTP "+r.status)).catch(e=>console.log("ERR "+((e.cause&&(e.cause.code||e.cause.message))||e.message)))' "$JF/System/Info/Public" 2>/dev/null)"
  if [[ "$jf_node" == "HTTP 200" ]]; then ok "Jellyfin joint par Noctra (Node.js)"; else bad "Noctra n'arrive pas a joindre Jellyfin ($jf_node) : c'est le \"fetch failed\" de la version web ; lancer la reparation (adresse locale)"; fi
  if [[ -n "$key" && "$jf_up" == 1 ]]; then
    http -H "Authorization: MediaBrowser Token=\"$key\"" "$JF/System/Info"
    if [[ "$CODE" == 200 ]]; then ok "Cle d'API Jellyfin acceptee"; else bad "Cle d'API Jellyfin refusee (code $CODE) : en creer une dans Jellyfin > Tableau de bord > Cles d'API"; fi
  fi
fi
QB="$(env_value QBITTORRENT_URL)"; QB="${QB%/}"
if [[ -n "$QB" ]]; then
  http --data-urlencode "username=$(env_value QBITTORRENT_USERNAME)" --data-urlencode "password=$(env_value QBITTORRENT_PASSWORD)" -H "Referer: $QB" "$QB/api/v2/auth/login"
  if [[ "$CODE" == 200 && "$BODY" == Ok* ]]; then ok "qBittorrent : connexion acceptee ($QB)"; elif [[ "$CODE" == 200 ]]; then bad "qBittorrent joignable mais identifiants refuses ($QB)"; else bad "qBittorrent injoignable ($QB, code $CODE)"; fi
  qb_conf="$HOME/.config/qBittorrent/qBittorrent.conf"
  qb_port="$(sed -nE 's/^WebUI\\Port=([0-9]+).*/\1/p' "$qb_conf" 2>/dev/null | tail -n 1)"
  [[ -n "$qb_port" ]] && info "Port de l'interface qBittorrent sur ce serveur : $qb_port"
fi
arr() {
  local name="$1" url key path="$4"
  url="$(env_value "$2")"; url="${url%/}"; key="$(env_value "$3")"
  [[ -n "$url" ]] || return 0
  http -H "X-Api-Key: $key" "$url$path"
  if [[ "$CODE" == 200 ]]; then ok "$name : $(json_field version) ($url)"; elif [[ "$CODE" == 401 ]]; then bad "$name joignable mais cle d'API refusee ($url)"; else bad "$name injoignable ($url, code $CODE)"; fi
}
arr Sonarr SONARR_URL SONARR_API_KEY /api/v3/system/status
arr Radarr RADARR_URL RADARR_API_KEY /api/v3/system/status
arr Prowlarr PROWLARR_URL PROWLARR_API_KEY /api/v1/system/status
JS="$(env_value JELLYSEERR_URL)"; JS="${JS%/}"
if [[ -n "$JS" ]]; then
  http -H "X-Api-Key: $(env_value JELLYSEERR_API_KEY)" "$JS/api/v1/settings/main"
  if [[ "$CODE" == 200 ]]; then ok "Jellyseerr / Seerr : cle acceptee ($JS)"; elif [[ "$CODE" == 401 || "$CODE" == 403 ]]; then bad "Jellyseerr joignable mais cle d'API refusee ($JS)"; else bad "Jellyseerr injoignable ($JS, code $CODE)"; fi
fi
TMDB="$(env_value TMDB_API_KEY)"
if [[ -n "$TMDB" ]]; then
  if [[ "$TMDB" == eyJ* ]]; then http -H "Authorization: Bearer $TMDB" "https://api.themoviedb.org/3/configuration"; else http "https://api.themoviedb.org/3/configuration?api_key=$TMDB"; fi
  if [[ "$CODE" == 200 ]]; then ok "TMDB : cle acceptee"; else bad "TMDB : cle refusee ou site injoignable (code $CODE)"; fi
fi

title "Mises a jour et relais"
[[ -x "$HOME/bin/noctra-update" ]] && ok "noctra-update installe" || note "noctra-update absent (facultatif avec l'updater PC) : bash $APP_DIR/ultra/install-updater.sh"
if systemctl --user list-timers --all 2>/dev/null | grep -q noctra-autoupdate; then ok "Mise a jour automatique (branche production) active"; else info "Mise a jour automatique non installee (facultative)"; fi
relay="$(systemctl --user is-active noctra-relais-tv.service 2>/dev/null || true)"
[[ "$relay" == active ]] && ok "Relais Samsung 2014 actif" || info "Relais Samsung 2014 : ${relay:-absent} (seulement pour la TV Samsung 2014)"

title "TV en direct (acces enregistres, fournisseurs vus depuis la seedbox)"
# Presence seulement : aucune cle ni session n'est affichee.
RUNTIME="$APP_DIR/runtime"
if [[ -s "$RUNTIME/livewatch-session.json" ]]; then ok "Compte LiveWatch VIP enregistre dans Noctra"; else note "Aucun compte LiveWatch VIP enregistre : serveurs LiveWatch VIP refuses (401) tant qu'il n'est pas connecte (TV en direct > Acces TV)"; fi
if [[ -s "$RUNTIME/tv-provider-keys.json" ]]; then
  for key in movix northlive; do
    if grep -qE "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" "$RUNTIME/tv-provider-keys.json"; then ok "Acces $key enregistre"; else note "Acces $key non enregistre (Acces TV)"; fi
  done
else
  note "Aucun acces Movix / Northlive enregistre (Acces TV)"
fi
for site in https://api.movix.college/api/livetv/manifest https://livewatch.icu/ https://northlive.lol/; do
  code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 -A 'Mozilla/5.0' "$site" 2>/dev/null || true)"
  host="${site#https://}"; host="${host%%/*}"
  case "$code" in
    2??|3??) ok "Fournisseur joignable depuis la seedbox : $host ($code)" ;;
    401|403) note "Fournisseur $host refuse la seedbox ($code) : refus du fournisseur (adresse IP du serveur), pas une panne de Noctra" ;;
    *) note "Fournisseur $host : reponse ${code:-aucune}" ;;
  esac
done

title "Derniers messages d'erreur de Noctra"
if [[ -s "$APP_DIR/logs/noctra-error.log" ]]; then
  tail -n 8 "$APP_DIR/logs/noctra-error.log" | sed -E 's/(api_key|token|password|apikey)=[^&[:space:]]+/\1=***/gI; s/^/     /'
else
  info "aucun"
fi

printf '\nBilan : %d OK, %d a verifier, %d probleme(s).\n' "$OK" "$WARN" "$BAD"
(( BAD == 0 ))
'@

# V8.1 : reparation sur place (sans nouvelle version), proposee apres le
# diagnostic ou lancee seule (-Repair).
$script:RepairScript = @'
#!/usr/bin/env bash
# Noctra - reparation sur place (V8.1), sans nouvelle version : .env adapte au
# serveur (ancien domaine, port qBittorrent, port de Noctra), service et proxy
# Ultra.cc recrees s'ils manquent, redemarrage et test /health. Copie du .env
# d'origine gardee (.env.avant-reparation-<date>).
set -Eeuo pipefail
APP_DIR="${NOCTRA_APP_DIR:-$HOME/apps/noctra}"
SERVICE_NAME="${NOCTRA_SERVICE_NAME:-noctra.service}"
OLD_HOST="${NOCTRA_OLD_HOST:-merlion.usbx.me}"
NEW_HOST="${NOCTRA_NEW_HOST:-astra.usbx.me}"
NGINX_FILE="$HOME/.apps/nginx/proxy.d/noctra.conf"
log()  { printf '\033[1;36m[Noctra]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Noctra]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[Erreur]\033[0m %s\n' "$*" >&2; exit 1; }
env_value() {
  local file="$1" key="$2"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\\1/p" "$file" | tail -n 1
}

set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
    sed -i -E "s#^([[:space:]]*${key}[[:space:]]*=[[:space:]]*).*#\\1${value}#" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# .env adapte au serveur actuel (sans jamais afficher les cles ni mots de passe).
repair_env() {
  local file="$1" old_escaped
  sed -i 's/\r$//; 1s/^\xEF\xBB\xBF//' "$file"
  old_escaped="${OLD_HOST//./\\.}"
  if [[ -n "$OLD_HOST" && "$OLD_HOST" != "$NEW_HOST" ]] && grep -qiE "([/@.]|//)${old_escaped}" "$file"; then
    sed -i -E "s#([/@.])${old_escaped}([/:?\"' ]|$)#\\1${NEW_HOST}\\2#gI" "$file"
    log "Adresses de l'ancien serveur ($OLD_HOST) remplacees par $NEW_HOST."
  fi
  # qBittorrent joint en local : port de son interface web sur CE serveur.
  local qb_conf="$HOME/.config/qBittorrent/qBittorrent.conf" qb_port current
  if [[ -f "$qb_conf" ]]; then
    qb_port="$(sed -nE 's/^WebUI\\Port=([0-9]+).*/\1/p' "$qb_conf" | tail -n 1)"
    current="$(env_value "$file" QBITTORRENT_URL)"
    if [[ -n "$qb_port" && "$current" =~ ^http://(127\.0\.0\.1|localhost):([0-9]+)(/.*)?$ ]]; then
      local old_port="${BASH_REMATCH[2]}" host="${BASH_REMATCH[1]}" path="${BASH_REMATCH[3]:-}"
      if [[ "$old_port" != "$qb_port" ]]; then
        set_env_value "$file" QBITTORRENT_URL "http://${host}:${qb_port}${path}"
        log "qBittorrent : port local $old_port -> $qb_port."
      fi
    fi
  fi
  chmod 600 "$file"
}

# Port de Noctra : garde s'il est libre ; occupe par un autre programme (seedbox
# deplacee, port deja pris sur ce serveur) : un port attribue libre (app-ports).
port_in_use() { timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" >/dev/null 2>&1; }
choose_port() {
  local file="$1" port candidate
  port="$(env_value "$file" PORT)"
  [[ -n "$port" ]] || return 0
  port_in_use "$port" || return 0
  if command -v app-ports >/dev/null 2>&1; then
    for candidate in $(app-ports free 2>/dev/null | grep -oE '\b[0-9]{5}\b'); do
      [[ "$candidate" == "$port" ]] && continue
      port_in_use "$candidate" && continue
      set_env_value "$file" PORT "$candidate"
      log "Port de Noctra $port deja utilise sur ce serveur : $candidate utilise."
      return 0
    done
  fi
  warn "Le port $port est deja utilise sur ce serveur ; choisis-en un autre (commande app-ports free) dans le .env si Noctra ne demarre pas."
}

# Service joint par Noctra lui-meme (Node.js, comme Noctra) : code HTTP, ou
# "ERR <cause>" (ENOTFOUND, ECONNREFUSED, certificat...). C'est cette requete
# qui affiche "fetch failed" dans la version web quand elle echoue.
node_fetch() {
  node -e 'const [u,h]=process.argv.slice(1);fetch(u,{headers:h?JSON.parse(h):{},redirect:"manual",signal:AbortSignal.timeout(10000)}).then(r=>console.log(String(r.status))).catch(e=>console.log("ERR "+((e.cause&&(e.cause.code||e.cause.message))||e.message)))' "$1" "${2:-}" 2>/dev/null || echo "ERR node"
}
# Adresse publique injoignable par Noctra : adresse locale du meme service sur
# la seedbox (port ecoute par son programme, chemin /jellyfin, /sonarr...).
# Ports TCP ecoutes par MES programmes dont la ligne de commande contient $1
# (jellyfin, sonarr...) : /proc seulement (ni ss ni root necessaires).
listen_ports() {
  local name="$1" pid fd link hex inodes=" "
  for pid in /proc/[0-9]*; do
    [[ -O "$pid" ]] || continue
    tr '\0' ' ' < "$pid/cmdline" 2>/dev/null | grep -qi -- "$name" || continue
    for fd in "$pid"/fd/*; do
      link="$(readlink "$fd" 2>/dev/null)" || continue
      [[ "$link" == socket:\[*\] ]] && inodes+="${link//[^0-9]/} "
    done
  done
  [[ "$inodes" == " " ]] && return 0
  for hex in $(awk -v list="$inodes" 'FNR > 1 && $4 == "0A" && index(list, " " $10 " ") { n = split($2, a, ":"); print a[n] }' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u); do
    printf '%d\n' "$((16#$hex))"
  done
}
fix_local() {
  local file="$1" key="$2" proc="$3" probe="$4" header="$5"; shift 5
  local url status port base candidate
  url="$(env_value "$file" "$key")"; [[ -n "$url" ]] || return 0
  url="${url%/}"
  status="$(node_fetch "$url$probe" "$header")"
  [[ "$status" =~ ^[23][0-9][0-9]$ ]] && return 0
  for port in $(listen_ports "$proc"); do
    for base in "$@"; do
      candidate="http://127.0.0.1:${port}${base}"
      if [[ "$(node_fetch "$candidate$probe" "$header")" =~ ^2[0-9][0-9]$ ]]; then
        set_env_value "$file" "$key" "$candidate"
        log "$key : $url injoignable par Noctra ($status) -> adresse locale $candidate"
        return 0
      fi
    done
  done
  warn "$key : $url injoignable par Noctra ($status), aucune adresse locale trouvee."
}
fix_services() {
  local file="$1"
  fix_local "$file" JELLYFIN_URL jellyfin /System/Info/Public '' /jellyfin ''
  fix_local "$file" SONARR_URL sonarr /api/v3/system/status "{\"X-Api-Key\":\"$(env_value "$file" SONARR_API_KEY)\"}" /sonarr ''
  fix_local "$file" RADARR_URL radarr /api/v3/system/status "{\"X-Api-Key\":\"$(env_value "$file" RADARR_API_KEY)\"}" /radarr ''
  fix_local "$file" PROWLARR_URL prowlarr /api/v1/system/status "{\"X-Api-Key\":\"$(env_value "$file" PROWLARR_API_KEY)\"}" /prowlarr ''
}

[[ -f "$APP_DIR/.env" ]] || fail "Noctra n'est pas installe dans $APP_DIR : lancer la mise a jour (LANCER-MISE-A-JOUR-NOCTRA-V8.cmd)."
if [[ -d "$HOME/.nvm/versions/node" ]]; then
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -path '*/bin/node' -perm -u+x 2>/dev/null | sort -V | tail -n 1)"
  [[ -n "$NODE_BIN" ]] && export PATH="$(dirname "$NODE_BIN"):$PATH"
fi
command -v node >/dev/null 2>&1 || fail "Node.js est introuvable."
cp -p "$APP_DIR/.env" "$APP_DIR/.env.avant-reparation-$(date +%Y%m%d-%H%M%S)"
repair_env "$APP_DIR/.env"
# Version web : son adresse de Jellyfin (public/client/config.json) suit aussi.
fix_services "$APP_DIR/.env"
CLIENT_CONFIG="$APP_DIR/public/client/config.json"
if [[ -f "$CLIENT_CONFIG" ]] && grep -qi "${OLD_HOST//./\\.}" "$CLIENT_CONFIG"; then
  sed -i -E "s#([/@.])${OLD_HOST//./\\.}#\\1${NEW_HOST}#gI" "$CLIENT_CONFIG"
  log "Version web : adresse de Jellyfin passee sur $NEW_HOST."
fi
if ! systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  choose_port "$APP_DIR/.env"
fi
PORT="$(env_value "$APP_DIR/.env" PORT)"
BASE_URL="$(env_value "$APP_DIR/.env" BASE_URL)"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL%/}"
SERVICE_FILE="$HOME/.config/systemd/user/$SERVICE_NAME"
if [[ ! -f "$SERVICE_FILE" || ! -f "$NGINX_FILE" ]] || ! grep -q "127.0.0.1:$PORT" "$NGINX_FILE" 2>/dev/null; then
  log "Service Noctra et proxy Ultra.cc (re)configures..."
  bash "$APP_DIR/ultra/install-ultra.sh"
fi
# 200.0.165 : reglage memoire WebAssembly du service. Sans lui, sur un service
# a memoire virtuelle limitee, toutes les requetes de Noctra echouent
# ("fetch failed", "Cannot allocate Wasm memory"). Ajoute dans un fichier
# complementaire du service (le service lui-meme n'est pas reecrit) ; un
# NODE_OPTIONS deja present est complete (copie gardee : .avant-wasm).
ensure_wasm_setting() {
  local unit="$HOME/.config/systemd/user/$SERVICE_NAME"
  [[ -f "$unit" ]] || return 0
  local node_bin
  node_bin="$(sed -nE 's/^ExecStart=([^[:space:]]+).*/\1/p' "$unit" | head -n 1)"
  [[ -x "$node_bin" ]] || node_bin="$(command -v node || true)"
  [[ -n "$node_bin" ]] || return 0
  "$node_bin" -e "process.exit(process.allowedNodeEnvironmentFlags.has('--disable-wasm-trap-handler')?0:1)" >/dev/null 2>&1 || return 0
  local dropdir="$unit.d" file
  if grep -qs -- '--disable-wasm-trap-handler' "$unit" "$dropdir"/*.conf; then return 0; fi
  if grep -qsE '^Environment="?NODE_OPTIONS=' "$unit" "$dropdir"/*.conf; then
    for file in "$unit" "$dropdir"/*.conf; do
      [[ -f "$file" ]] && grep -qE '^Environment="?NODE_OPTIONS=' "$file" || continue
      cp -p "$file" "$file.avant-wasm" 2>/dev/null || true
      sed -i -E 's/^(Environment="?NODE_OPTIONS=)/\1--disable-wasm-trap-handler /' "$file" || true
    done
  else
    mkdir -p "$dropdir"
    printf '[Service]\nEnvironment=NODE_OPTIONS=--disable-wasm-trap-handler\n' > "$dropdir/noctra-memoire-wasm.conf"
  fi
  log "Service : reglage memoire WebAssembly ajoute (NODE_OPTIONS=--disable-wasm-trap-handler)."
}
ensure_wasm_setting || true
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl --user restart "$SERVICE_NAME"
HEALTH_URL="http://127.0.0.1:${PORT}${BASE_URL}/health"
log "Verification du service : $HEALTH_URL"
for _ in {1..30}; do
  if curl --silent --fail --max-time 3 "$HEALTH_URL" | grep -q '"status":"ok"'; then
    log "Reparation terminee : Noctra repond."
    exit 0
  fi
  sleep 1
done
tail -n 15 "$APP_DIR/logs/noctra-error.log" 2>/dev/null | sed 's/^/  | /' >&2 || true
fail "Noctra ne repond toujours pas apres la reparation."
'@

function Invoke-NoctraRepair {
    param([string]$Target)
    Write-Step 'Reparation : adresses du nouveau serveur, port qBittorrent, service et proxy Ultra.cc'
    $tempRepair = Join-Path ([System.IO.Path]::GetTempPath()) ('noctra-repair-' + [guid]::NewGuid().ToString('N') + '.sh')
    try {
        [System.IO.File]::WriteAllText($tempRepair, $script:RepairScript.Replace("`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
        $scpPath = (Get-Command 'scp.exe' -ErrorAction Stop).Source
        $upload = Invoke-NativeQuiet -FilePath $scpPath -TimeoutSeconds 60 -Arguments @(
            '-q', '-P', [string]$SshPort, '-i', $IdentityFile,
            '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
            $tempRepair, "${Target}:~/noctra-repair.sh")
        if ($upload.ExitCode -ne 0) { Stop-WithError "Envoi de la reparation refuse (code $($upload.ExitCode)). $($upload.StdErr)" }
    }
    finally {
        Remove-Item -LiteralPath $tempRepair -Force -ErrorAction SilentlyContinue
    }
    $command = "NOCTRA_OLD_HOST=$OldRemoteHost NOCTRA_NEW_HOST=$RemoteHost bash " + '$HOME/noctra-repair.sh; status=$?; rm -f $HOME/noctra-repair.sh; exit $status'
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & ssh.exe -p $SshPort -i $IdentityFile -o 'IdentitiesOnly=yes' -o 'BatchMode=yes' -o 'StrictHostKeyChecking=accept-new' $Target $command
        $repairExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($repairExitCode -ne 0) { Write-Host "La reparation n'a pas abouti (code $repairExitCode) : voir le diagnostic ci-dessous." -ForegroundColor Yellow }
    else { Write-Host 'Reparation terminee.' -ForegroundColor Green }
}

function Invoke-NoctraDiagnostic {
    param([string]$Target)
    Write-Step 'Diagnostic du serveur (Node.js, installation, service, Jellyfin, qBittorrent, Sonarr, Radarr...)'
    $tempDiag = Join-Path ([System.IO.Path]::GetTempPath()) ('noctra-diagnostic-' + [guid]::NewGuid().ToString('N') + '.sh')
    try {
        [System.IO.File]::WriteAllText($tempDiag, $script:DiagnosticScript.Replace("`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
        $scpPath = (Get-Command 'scp.exe' -ErrorAction Stop).Source
        $upload = Invoke-NativeQuiet -FilePath $scpPath -TimeoutSeconds 60 -Arguments @(
            '-q', '-P', [string]$SshPort, '-i', $IdentityFile,
            '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
            $tempDiag, "${Target}:~/noctra-diagnostic.sh")
        if ($upload.ExitCode -ne 0) {
            Write-Host "Diagnostic impossible : envoi refuse (code $($upload.ExitCode)). $($upload.StdErr)" -ForegroundColor Yellow
            return
        }
    }
    finally {
        Remove-Item -LiteralPath $tempDiag -Force -ErrorAction SilentlyContinue
    }
    $command = "NOCTRA_OLD_HOST=$OldRemoteHost NOCTRA_NEW_HOST=$RemoteHost bash " + '$HOME/noctra-diagnostic.sh; status=$?; rm -f $HOME/noctra-diagnostic.sh; exit $status'
    $result = Invoke-NoctraRemote -Target $Target -Command $command -TimeoutSeconds 240
    $report = ($result.StdOut + $(if ($result.StdErr) { [Environment]::NewLine + $result.StdErr } else { '' })).Trim()
    if ([string]::IsNullOrWhiteSpace($report)) {
        Write-Host "Diagnostic sans reponse (code $($result.ExitCode))." -ForegroundColor Yellow
        return
    }
    foreach ($line in ($report -split "`r?`n")) {
        $color = if ($line.StartsWith('[OK]')) { 'Green' } elseif ($line.StartsWith('[!!]')) { 'Red' } elseif ($line.StartsWith('[??]')) { 'Yellow' } elseif ($line.StartsWith('==')) { 'Cyan' } else { 'Gray' }
        Write-Host $line -ForegroundColor $color
    }
    $script:DiagnosticProblems = @($report -split "`r?`n" | Where-Object { $_.StartsWith('[!!]') }).Count
    $reportPath = Join-Path $PSScriptRoot ('RAPPORT-NOCTRA-' + (Get-Date -Format 'yyyyMMdd-HHmm') + '.txt')
    try {
        [System.IO.File]::WriteAllText($reportPath, $report.Replace("`n", "`r`n"), [System.Text.UTF8Encoding]::new($true))
        Write-Host "`nRapport enregistre : $reportPath (tu peux l'envoyer tel quel, il ne contient aucune cle)." -ForegroundColor DarkCyan
    }
    catch {
        Write-Host "Rapport non enregistre : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

try {
    Require-Command 'ssh.exe'
    Require-Command 'scp.exe'
    Require-Command 'ssh-keygen.exe'

    if (-not (Test-Path -LiteralPath $DownloadsPath -PathType Container)) {
        Stop-WithError "Le dossier de telechargements est introuvable : $DownloadsPath"
    }

    Write-Host "[Noctra Updater PC v$script:NoctraUpdaterVersion]" -ForegroundColor DarkCyan

    if ($Diagnostic -or $Repair) {
        $sshTarget = "${RemoteUser}@${RemoteHost}"
        Ensure-NoctraSshKey -Target $sshTarget -KeyFile $IdentityFile
        $script:DiagnosticProblems = 0
        if ($Repair) {
            Invoke-NoctraRepair -Target $sshTarget
            Invoke-NoctraDiagnostic -Target $sshTarget
            exit 0
        }
        Invoke-NoctraDiagnostic -Target $sshTarget
        if ($script:DiagnosticProblems -gt 0) {
            $answer = Read-Host "`n$($script:DiagnosticProblems) probleme(s). Reparer automatiquement maintenant (adresses du nouveau serveur, port qBittorrent, service et proxy) ? (O/N)"
            if ($answer -match '^(o|oui|y|yes)$') {
                Invoke-NoctraRepair -Target $sshTarget
                Invoke-NoctraDiagnostic -Target $sshTarget
            }
        }
        exit 0
    }
    Write-Step "Recherche de la version Noctra la plus recente dans : $DownloadsPath"

    $versionPattern = [regex]'^noctra-media-client-v(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?\.zip$'

    $candidates = foreach ($file in Get-ChildItem -LiteralPath $DownloadsPath -File -Filter 'noctra-media-client-v*.zip') {
        $match = $versionPattern.Match($file.Name)
        if ($match.Success) {
            $major = [int]$match.Groups['major'].Value
            $minor = if ($match.Groups['minor'].Success) { [int]$match.Groups['minor'].Value } else { 0 }
            $patch = if ($match.Groups['patch'].Success) { [int]$match.Groups['patch'].Value } else { 0 }

            [pscustomobject]@{
                File          = $file
                ParsedVersion = [System.Version]::Parse("$major.$minor.$patch")
            }
        }
    }

    $selected = $candidates |
        Sort-Object -Property @{ Expression = 'ParsedVersion'; Descending = $true },
                              @{ Expression = { $_.File.LastWriteTimeUtc }; Descending = $true } |
        Select-Object -First 1

    if (-not $selected) {
        Stop-WithError "Aucune archive nommee noctra-media-client-vXX.zip n'a ete trouvee dans $DownloadsPath"
    }

    $archive = $selected.File
    $version = $selected.ParsedVersion
    $sizeMb = [math]::Round($archive.Length / 1MB, 2)

    Write-Host "Version detectee : v$version" -ForegroundColor Green
    Write-Host "Archive          : $($archive.FullName)"
    Write-Host "Taille           : $sizeMb Mo"

    $shaFile = "$($archive.FullName).sha256"
    if (Test-Path -LiteralPath $shaFile -PathType Leaf) {
        Write-Step 'Verification SHA-256 locale'
        $expectedHash = ((Get-Content -LiteralPath $shaFile -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
        $actualHash = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($expectedHash -ne $actualHash) {
            Stop-WithError "L'empreinte SHA-256 ne correspond pas. Le ZIP est peut-etre incomplet ou corrompu."
        }
        Write-Host 'Empreinte SHA-256 valide.' -ForegroundColor Green
    }

    if (-not $Force) {
        $answer = Read-Host "Mettre a jour Noctra sur $RemoteUser@$RemoteHost vers la v$version ? (O/N)"
        if ($answer -notmatch '^(o|oui|y|yes)$') {
            Write-Host 'Mise a jour annulee.' -ForegroundColor Yellow
            exit 0
        }
    }

    $sshTarget = "${RemoteUser}@${RemoteHost}"
    Ensure-NoctraSshKey -Target $sshTarget -KeyFile $IdentityFile

    # V8 : Noctra deja installe sur ce serveur ? Sinon (seedbox deplacee sans
    # le dossier de Noctra), premiere installation avec le .env garde sur le PC.
    Write-Step "Verification de l'installation Noctra sur $RemoteHost"
    $probe = Invoke-NoctraRemote -Target $sshTarget -Command 'if [ -f "$HOME/apps/noctra/.env" ]; then echo NOCTRA_INSTALLED; else echo NOCTRA_ABSENT; fi'
    if ($probe.ExitCode -ne 0 -or $probe.StdOut -notmatch 'NOCTRA_(INSTALLED|ABSENT)') {
        Stop-WithError "Impossible de verifier l'installation sur la seedbox (code $($probe.ExitCode)). $($probe.StdErr)"
    }
    $freshInstall = $probe.StdOut -match 'NOCTRA_ABSENT'
    $localEnv = $null
    if ($freshInstall) {
        $localEnv = Find-LocalEnvFile
        if (-not $localEnv) {
            Stop-WithError "Noctra n'est pas installe sur $RemoteHost et aucun fichier .env n'a ete trouve a cote du script. Copie ton ancien .env (par exemple .env.merlion) dans ce dossier puis relance."
        }
        Write-Host "Noctra absent de ce serveur : premiere installation avec $($localEnv.Name) (adresses et ports adaptes automatiquement)." -ForegroundColor Yellow
    }
    else {
        Write-Host 'Installation existante trouvee : mise a jour (le .env du serveur est conserve et adapte si besoin).' -ForegroundColor Green
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("noctra-pc-update-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    try {
        $stagedZip = Join-Path $tempRoot 'noctra-update-latest.zip'
        $remoteUpdater = Join-Path $tempRoot 'noctra-update-from-pc.sh'
        Copy-Item -LiteralPath $archive.FullName -Destination $stagedZip

        $remoteScript = @'
#!/usr/bin/env bash
# Noctra - installation depuis le PC (V8).
# Mise a jour : .env du serveur conserve, sauvegarde, test /health, retour
# arriere automatique. Premiere installation (seedbox deplacee sans le dossier
# Noctra) : .env envoye par le PC. Dans les deux cas, le .env est adapte au
# serveur : ancien domaine remplace, port local de qBittorrent corrige, port de
# Noctra libre, service et proxy Ultra.cc recrees s'ils manquent.
set -Eeuo pipefail

APP_DIR="${NOCTRA_APP_DIR:-$HOME/apps/noctra}"
SERVICE_NAME="${NOCTRA_SERVICE_NAME:-noctra.service}"
ARCHIVE="${1:-$HOME/noctra-update-latest.zip}"
ENV_UPLOAD="${2:-}"
OLD_HOST="${NOCTRA_OLD_HOST:-merlion.usbx.me}"
NEW_HOST="${NOCTRA_NEW_HOST:-astra.usbx.me}"
NGINX_FILE="$HOME/.apps/nginx/proxy.d/noctra.conf"
TMP_ROOT=""
BACKUP_DIR=""
SWAPPED=0
FRESH=0
SELF_PATH="${BASH_SOURCE[0]}"
NODE_BIN=""

log()  { printf '\033[1;36m[Noctra]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Noctra]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[Erreur]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup_temp() {
  [[ -n "$TMP_ROOT" && -d "$TMP_ROOT" ]] && rm -rf "$TMP_ROOT"
  [[ -n "$ENV_UPLOAD" && -f "$ENV_UPLOAD" ]] && rm -f "$ENV_UPLOAD"
  return 0
}

rollback() {
  local status=$?
  if (( status != 0 )) && (( SWAPPED == 1 )) && [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
    printf '\n\033[1;33m[Noctra]\033[0m Echec detecte, restauration automatique de la version precedente...\n' >&2
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    [[ -d "$APP_DIR" ]] && mv "$APP_DIR" "${APP_DIR}-failed-$(date +%Y%m%d-%H%M%S)"
    mv "$BACKUP_DIR" "$APP_DIR"
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    systemctl --user start "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  if (( status != 0 )) && (( FRESH == 1 )); then
    printf '\n\033[1;33m[Noctra]\033[0m Premiere installation incomplete : fichiers laisses dans %s pour le diagnostic (journal : %s/logs).\n' "$APP_DIR" "$APP_DIR" >&2
  fi
  cleanup_temp
  exit "$status"
}
trap rollback EXIT

resolve_node() {
  local candidate=""
  # Les sessions SSH non interactives ne chargent pas NVM dans le PATH.
  if [[ -d "$HOME/.nvm/versions/node" ]]; then
    candidate="$(find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -path '*/bin/node' -perm -u+x 2>/dev/null | sort -V | tail -n 1)"
    if [[ -n "$candidate" && -x "$candidate" ]]; then printf '%s' "$candidate"; return 0; fi
  fi
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  if [[ -x "$HOME/bin/node" ]]; then printf '%s' "$HOME/bin/node"; return 0; fi
  return 1
}

env_value() {
  local file="$1" key="$2"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\\1/p" "$file" | tail -n 1
}

set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
    sed -i -E "s#^([[:space:]]*${key}[[:space:]]*=[[:space:]]*).*#\\1${value}#" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# .env adapte au serveur actuel (sans jamais afficher les cles ni mots de passe).
repair_env() {
  local file="$1" old_escaped
  sed -i 's/\r$//; 1s/^\xEF\xBB\xBF//' "$file"
  old_escaped="${OLD_HOST//./\\.}"
  if [[ -n "$OLD_HOST" && "$OLD_HOST" != "$NEW_HOST" ]] && grep -qiE "([/@.]|//)${old_escaped}" "$file"; then
    sed -i -E "s#([/@.])${old_escaped}([/:?\"' ]|$)#\\1${NEW_HOST}\\2#gI" "$file"
    log "Adresses de l'ancien serveur ($OLD_HOST) remplacees par $NEW_HOST."
  fi
  # qBittorrent joint en local : port de son interface web sur CE serveur.
  local qb_conf="$HOME/.config/qBittorrent/qBittorrent.conf" qb_port current
  if [[ -f "$qb_conf" ]]; then
    qb_port="$(sed -nE 's/^WebUI\\Port=([0-9]+).*/\1/p' "$qb_conf" | tail -n 1)"
    current="$(env_value "$file" QBITTORRENT_URL)"
    if [[ -n "$qb_port" && "$current" =~ ^http://(127\.0\.0\.1|localhost):([0-9]+)(/.*)?$ ]]; then
      local old_port="${BASH_REMATCH[2]}" host="${BASH_REMATCH[1]}" path="${BASH_REMATCH[3]:-}"
      if [[ "$old_port" != "$qb_port" ]]; then
        set_env_value "$file" QBITTORRENT_URL "http://${host}:${qb_port}${path}"
        log "qBittorrent : port local $old_port -> $qb_port."
      fi
    fi
  fi
  chmod 600 "$file"
}

# Port de Noctra : garde s'il est libre ; occupe par un autre programme (seedbox
# deplacee, port deja pris sur ce serveur) : un port attribue libre (app-ports).
port_in_use() { timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" >/dev/null 2>&1; }
choose_port() {
  local file="$1" port candidate
  port="$(env_value "$file" PORT)"
  [[ -n "$port" ]] || return 0
  port_in_use "$port" || return 0
  if command -v app-ports >/dev/null 2>&1; then
    for candidate in $(app-ports free 2>/dev/null | grep -oE '\b[0-9]{5}\b'); do
      [[ "$candidate" == "$port" ]] && continue
      port_in_use "$candidate" && continue
      set_env_value "$file" PORT "$candidate"
      log "Port de Noctra $port deja utilise sur ce serveur : $candidate utilise."
      return 0
    done
  fi
  warn "Le port $port est deja utilise sur ce serveur ; choisis-en un autre (commande app-ports free) dans le .env si Noctra ne demarre pas."
}

# Service joint par Noctra lui-meme (Node.js, comme Noctra) : code HTTP, ou
# "ERR <cause>" (ENOTFOUND, ECONNREFUSED, certificat...). C'est cette requete
# qui affiche "fetch failed" dans la version web quand elle echoue.
node_fetch() {
  node -e 'const [u,h]=process.argv.slice(1);fetch(u,{headers:h?JSON.parse(h):{},redirect:"manual",signal:AbortSignal.timeout(10000)}).then(r=>console.log(String(r.status))).catch(e=>console.log("ERR "+((e.cause&&(e.cause.code||e.cause.message))||e.message)))' "$1" "${2:-}" 2>/dev/null || echo "ERR node"
}
# Adresse publique injoignable par Noctra : adresse locale du meme service sur
# la seedbox (port ecoute par son programme, chemin /jellyfin, /sonarr...).
# Ports TCP ecoutes par MES programmes dont la ligne de commande contient $1
# (jellyfin, sonarr...) : /proc seulement (ni ss ni root necessaires).
listen_ports() {
  local name="$1" pid fd link hex inodes=" "
  for pid in /proc/[0-9]*; do
    [[ -O "$pid" ]] || continue
    tr '\0' ' ' < "$pid/cmdline" 2>/dev/null | grep -qi -- "$name" || continue
    for fd in "$pid"/fd/*; do
      link="$(readlink "$fd" 2>/dev/null)" || continue
      [[ "$link" == socket:\[*\] ]] && inodes+="${link//[^0-9]/} "
    done
  done
  [[ "$inodes" == " " ]] && return 0
  for hex in $(awk -v list="$inodes" 'FNR > 1 && $4 == "0A" && index(list, " " $10 " ") { n = split($2, a, ":"); print a[n] }' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u); do
    printf '%d\n' "$((16#$hex))"
  done
}
fix_local() {
  local file="$1" key="$2" proc="$3" probe="$4" header="$5"; shift 5
  local url status port base candidate
  url="$(env_value "$file" "$key")"; [[ -n "$url" ]] || return 0
  url="${url%/}"
  status="$(node_fetch "$url$probe" "$header")"
  [[ "$status" =~ ^[23][0-9][0-9]$ ]] && return 0
  for port in $(listen_ports "$proc"); do
    for base in "$@"; do
      candidate="http://127.0.0.1:${port}${base}"
      if [[ "$(node_fetch "$candidate$probe" "$header")" =~ ^2[0-9][0-9]$ ]]; then
        set_env_value "$file" "$key" "$candidate"
        log "$key : $url injoignable par Noctra ($status) -> adresse locale $candidate"
        return 0
      fi
    done
  done
  warn "$key : $url injoignable par Noctra ($status), aucune adresse locale trouvee."
}
fix_services() {
  local file="$1"
  fix_local "$file" JELLYFIN_URL jellyfin /System/Info/Public '' /jellyfin ''
  fix_local "$file" SONARR_URL sonarr /api/v3/system/status "{\"X-Api-Key\":\"$(env_value "$file" SONARR_API_KEY)\"}" /sonarr ''
  fix_local "$file" RADARR_URL radarr /api/v3/system/status "{\"X-Api-Key\":\"$(env_value "$file" RADARR_API_KEY)\"}" /radarr ''
  fix_local "$file" PROWLARR_URL prowlarr /api/v1/system/status "{\"X-Api-Key\":\"$(env_value "$file" PROWLARR_API_KEY)\"}" /prowlarr ''
}

command -v unzip >/dev/null 2>&1 || fail "unzip est introuvable sur la seedbox."
command -v systemctl >/dev/null 2>&1 || fail "systemctl est introuvable sur la seedbox."
command -v curl >/dev/null 2>&1 || fail "curl est introuvable sur la seedbox."

NODE_BIN="$(resolve_node)" || fail "Node.js est introuvable (ni ~/.nvm/versions/node ni ~/bin). Installe Node.js 20 ou plus sur ce serveur (Ultra.cc : NVM) puis relance."
export PATH="$(dirname "$NODE_BIN"):$PATH"
log "Node.js detecte : $($NODE_BIN --version) ($NODE_BIN)"

[[ -f "$ARCHIVE" ]] || fail "Archive distante introuvable : $ARCHIVE"
if [[ ! -f "$APP_DIR/.env" ]]; then
  [[ -n "$ENV_UPLOAD" && -f "$ENV_UPLOAD" ]] || fail "Noctra n'est pas installe dans $APP_DIR et aucun .env n'a ete envoye."
  FRESH=1
fi

unzip -tq "$ARCHIVE" >/dev/null || fail "L'archive ZIP est invalide ou incomplete."

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/noctra-update-pc.XXXXXX")"
STAGE="$TMP_ROOT/stage"
mkdir -p "$STAGE"

log "Extraction et verification de la nouvelle version..."
unzip -q "$ARCHIVE" -d "$STAGE"

NEW_DIR="$(find "$STAGE" -mindepth 1 -maxdepth 4 -type f -name server.mjs -printf '%h\n' | head -n 1)"
if [[ -z "$NEW_DIR" ]] && command -v python3 >/dev/null 2>&1; then
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  python3 -c 'import sys,os,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
  for m in z.infolist():
    n = m.filename.replace("\\","/")
    p = os.path.join(sys.argv[2], n)
    if n.endswith("/"): os.makedirs(p, exist_ok=True)
    else:
      os.makedirs(os.path.dirname(p), exist_ok=True)
      with z.open(m) as s, open(p,"wb") as d: d.write(s.read())' "$ARCHIVE" "$STAGE"
  NEW_DIR="$(find "$STAGE" -mindepth 1 -maxdepth 4 -type f -name server.mjs -printf '%h\n' | head -n 1)"
fi
[[ -n "$NEW_DIR" && -f "$NEW_DIR/package.json" ]] || fail "Structure Noctra non reconnue dans le ZIP."
[[ -f "$NEW_DIR/public/noctra-shell.js" ]] || fail "Client Noctra incomplet."

"$NODE_BIN" --check "$NEW_DIR/server.mjs" >/dev/null
"$NODE_BIN" --check "$NEW_DIR/public/noctra-shell.js" >/dev/null

NEW_VERSION="$("$NODE_BIN" -e "const p=require(process.argv[1]);process.stdout.write(String(p.version||''))" "$NEW_DIR/package.json")"
[[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Version invalide dans package.json."

if (( FRESH == 1 )); then
  log "Premiere installation de Noctra $NEW_VERSION sur ce serveur."
  cp "$ENV_UPLOAD" "$NEW_DIR/.env"
else
  CURRENT_VERSION="$("$NODE_BIN" -e "try{const p=require(process.argv[1]);process.stdout.write(String(p.version||'inconnue'))}catch{}" "$APP_DIR/package.json")"
  log "Mise a jour $CURRENT_VERSION -> $NEW_VERSION"
  cp "$APP_DIR/.env" "$NEW_DIR/.env"
fi
repair_env "$NEW_DIR/.env"
fix_services "$NEW_DIR/.env"
# Premiere installation, ou Noctra arrete (seedbox deplacee) : port verifie.
if (( FRESH == 1 )) || ! systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  choose_port "$NEW_DIR/.env"
fi

if (( FRESH == 0 )); then
  for keep in runtime logs; do
    if [[ -d "$APP_DIR/$keep" ]]; then
      mkdir -p "$NEW_DIR/$keep"
      cp -a "$APP_DIR/$keep/." "$NEW_DIR/$keep/" 2>/dev/null || true
    fi
  done
  BACKUP_DIR="$HOME/apps/noctra-backup-$(date +%Y%m%d-%H%M%S)-v${CURRENT_VERSION}"
  log "Arret du service et sauvegarde de la version actuelle..."
  systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  mv "$APP_DIR" "$BACKUP_DIR"
  mv "$NEW_DIR" "$APP_DIR"
  SWAPPED=1
else
  mkdir -p "$(dirname "$APP_DIR")"
  [[ -d "$APP_DIR" ]] && mv "$APP_DIR" "${APP_DIR}-ancien-$(date +%Y%m%d-%H%M%S)"
  mv "$NEW_DIR" "$APP_DIR"
fi

# Service systemd et proxy Ultra.cc : recrees s'ils manquent (seedbox deplacee)
# ou si le port de Noctra a change ; sinon simple redemarrage.
PORT="$(env_value "$APP_DIR/.env" PORT)"
BASE_URL="$(env_value "$APP_DIR/.env" BASE_URL)"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL%/}"
SERVICE_FILE="$HOME/.config/systemd/user/$SERVICE_NAME"
# 200.0.165 : reglage memoire WebAssembly du service. Sans lui, sur un service
# a memoire virtuelle limitee, toutes les requetes de Noctra echouent
# ("fetch failed", "Cannot allocate Wasm memory"). Ajoute dans un fichier
# complementaire du service (le service lui-meme n'est pas reecrit) ; un
# NODE_OPTIONS deja present est complete (copie gardee : .avant-wasm).
ensure_wasm_setting() {
  local unit="$HOME/.config/systemd/user/$SERVICE_NAME"
  [[ -f "$unit" ]] || return 0
  local node_bin
  node_bin="$(sed -nE 's/^ExecStart=([^[:space:]]+).*/\1/p' "$unit" | head -n 1)"
  [[ -x "$node_bin" ]] || node_bin="$(command -v node || true)"
  [[ -n "$node_bin" ]] || return 0
  "$node_bin" -e "process.exit(process.allowedNodeEnvironmentFlags.has('--disable-wasm-trap-handler')?0:1)" >/dev/null 2>&1 || return 0
  local dropdir="$unit.d" file
  if grep -qs -- '--disable-wasm-trap-handler' "$unit" "$dropdir"/*.conf; then return 0; fi
  if grep -qsE '^Environment="?NODE_OPTIONS=' "$unit" "$dropdir"/*.conf; then
    for file in "$unit" "$dropdir"/*.conf; do
      [[ -f "$file" ]] && grep -qE '^Environment="?NODE_OPTIONS=' "$file" || continue
      cp -p "$file" "$file.avant-wasm" 2>/dev/null || true
      sed -i -E 's/^(Environment="?NODE_OPTIONS=)/\1--disable-wasm-trap-handler /' "$file" || true
    done
  else
    mkdir -p "$dropdir"
    printf '[Service]\nEnvironment=NODE_OPTIONS=--disable-wasm-trap-handler\n' > "$dropdir/noctra-memoire-wasm.conf"
  fi
  log "Service : reglage memoire WebAssembly ajoute (NODE_OPTIONS=--disable-wasm-trap-handler)."
}
if (( FRESH == 1 )) || [[ ! -f "$SERVICE_FILE" || ! -f "$NGINX_FILE" ]] || ! grep -q "127.0.0.1:$PORT" "$NGINX_FILE" 2>/dev/null; then
  log "Service Noctra et proxy Ultra.cc (re)configures..."
  bash "$APP_DIR/ultra/install-ultra.sh"
  ensure_wasm_setting || true
  systemctl --user daemon-reload
  systemctl --user restart "$SERVICE_NAME"
else
  ensure_wasm_setting || true
  systemctl --user daemon-reload
  systemctl --user start "$SERVICE_NAME"
fi
systemctl --user try-restart noctra-relais-tv.service >/dev/null 2>&1 || true

HEALTH_URL="http://127.0.0.1:${PORT}${BASE_URL}/health"
log "Verification du service : $HEALTH_URL"
HEALTH_OK=0
for _ in {1..30}; do
  if curl --silent --fail --max-time 3 "$HEALTH_URL" | grep -q '"status":"ok"'; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
if (( HEALTH_OK == 0 )); then
  tail -n 15 "$APP_DIR/logs/noctra-error.log" 2>/dev/null | sed 's/^/  | /' >&2 || true
  fail "Le test de sante a echoue."
fi

SWAPPED=0
trap - EXIT
cleanup_temp
rm -f "$ARCHIVE"
rm -f "$SELF_PATH"

# Rotation automatique : conserve uniquement les 3 sauvegardes noctra-backup-* les plus recentes
mapfile -t OLD_BACKUPS < <(ls -1dt "$HOME"/apps/noctra-backup-* 2>/dev/null | tail -n +4)
if (( ${#OLD_BACKUPS[@]} > 0 )); then
  log "Nettoyage des anciennes sauvegardes (${#OLD_BACKUPS[@]})..."
  rm -rf -- "${OLD_BACKUPS[@]}" 2>/dev/null || true
fi

if (( FRESH == 1 )); then
  log "Premiere installation terminee : Noctra $NEW_VERSION."
else
  log "Mise a jour terminee avec succes vers Noctra $NEW_VERSION."
  log "Sauvegarde conservee : $BACKUP_DIR"
fi
'@

        [System.IO.File]::WriteAllText(
            $remoteUpdater,
            $remoteScript.Replace("`r`n", "`n"),
            [System.Text.UTF8Encoding]::new($false)
        )

        $uploads = @($stagedZip, $remoteUpdater)
        if ($freshInstall) {
            $stagedEnv = Join-Path $tempRoot 'noctra-env-from-pc'
            Copy-Item -LiteralPath $localEnv.FullName -Destination $stagedEnv
            $uploads += $stagedEnv
        }

        Write-Step 'Envoi du ZIP et du programme de mise a jour sur Ultra.cc'
        $destination = "${RemoteUser}@${RemoteHost}:~/"
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & scp.exe `
                -P $SshPort `
                -i $IdentityFile `
                -o 'IdentitiesOnly=yes' `
                -o 'BatchMode=yes' `
                -o 'StrictHostKeyChecking=accept-new' `
                @uploads $destination

            $scpExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if ($scpExitCode -ne 0) {
            Stop-WithError "L'envoi SCP a echoue (code $scpExitCode)."
        }

        Write-Step 'Installation automatique sur la seedbox'
        # Chemins sans espace : aucun guillemet a transmettre (PowerShell 5.1 les perd).
        $remoteCommand = "NOCTRA_OLD_HOST=$OldRemoteHost NOCTRA_NEW_HOST=$RemoteHost bash " + '$HOME/noctra-update-from-pc.sh $HOME/noctra-update-latest.zip'
        if ($freshInstall) { $remoteCommand += ' $HOME/noctra-env-from-pc' }
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & ssh.exe `
                -p $SshPort `
                -i $IdentityFile `
                -o 'IdentitiesOnly=yes' `
                -o 'BatchMode=yes' `
                -o 'StrictHostKeyChecking=accept-new' `
                $sshTarget $remoteCommand

            $remoteExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if ($remoteExitCode -ne 0) {
            Stop-WithError "La mise a jour distante a echoue (code $remoteExitCode). L'ancienne version a normalement ete restauree automatiquement."
        }

        Write-Host "`nNoctra v$version est installee sur Ultra.cc." -ForegroundColor Green

        # V8 : verification depuis Internet (adresse utilisee par les applis).
        $publicHealth = "https://$RemoteUser.$RemoteHost/noctra/health"
        Write-Step "Verification depuis Internet : $publicHealth"
        try {
            $response = Invoke-WebRequest -Uri $publicHealth -UseBasicParsing -TimeoutSec 20
            if ($response.Content -match '"status"\s*:\s*"ok"') {
                Write-Host 'Noctra repond depuis Internet : applis et site fonctionnent avec la nouvelle adresse.' -ForegroundColor Green
            }
            else {
                Write-Host "Reponse inattendue de $publicHealth (code $($response.StatusCode))." -ForegroundColor Yellow
            }
        }
        catch {
            Write-Host "Noctra tourne sur la seedbox mais ne repond pas encore depuis Internet ($($_.Exception.Message)). Attends une minute (redemarrage du proxy Ultra.cc) puis ouvre $publicHealth." -ForegroundColor Yellow
        }
        Write-Host 'Tu peux fermer puis rouvrir la PWA. Sur PC, utilise Ctrl+Shift+R si necessaire.'
        Invoke-NoctraDiagnostic -Target $sshTarget
    }
    finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
catch {
    $logPath = Join-Path $PSScriptRoot 'DERNIERE-ERREUR-NOCTRA.txt'
    $detailsParts = @(
        "Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "Message : $($_.Exception.Message)"
        "Type : $($_.Exception.GetType().FullName)"
        "Position : $($_.InvocationInfo.PositionMessage)"
        "Pile : $($_.ScriptStackTrace)"
    )
    if (-not [string]::IsNullOrWhiteSpace($script:LastSshDiagnostic)) {
        $detailsParts += ""
        $detailsParts += "Diagnostic SSH detaille :"
        $detailsParts += $script:LastSshDiagnostic
    }
    $details = $detailsParts -join [Environment]::NewLine

    try {
        [System.IO.File]::WriteAllText($logPath, $details, [System.Text.UTF8Encoding]::new($false))
        Write-Host "Diagnostic enregistre dans : $logPath" -ForegroundColor DarkYellow
    }
    catch {
        # Le message principal reste affiche si le journal ne peut pas etre ecrit.
    }

    Write-Host "`n[Erreur] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
