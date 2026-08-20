# Despliegue Autoescuela Sara → Hostinger (FTP)
# Uso: .\scripts\deploy-hostinger.ps1
# Requiere: deploy\hostinger.env con credenciales reales

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $Root 'deploy\hostinger.env'

if (-not (Test-Path $EnvFile)) {
    Write-Error "Crea deploy\hostinger.env a partir de deploy\hostinger.env.example"
}

# Cargar variables
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_ -split '=', 2
    if ($parts.Count -eq 2) {
        Set-Variable -Name $parts[0].Trim() -Value $parts[1].Trim() -Scope Script
    }
}

$required = @('BASE_URL','DB_HOST','DB_NAME','DB_USER','DB_PASS','FTP_HOST','FTP_USER','FTP_PASS','FTP_REMOTE_DIR')
foreach ($key in $required) {
    if (-not (Get-Variable -Name $key -ErrorAction SilentlyContinue) -or [string]::IsNullOrWhiteSpace((Get-Variable $key).Value)) {
        Write-Error "Falta o está vacío: $key en deploy\hostinger.env"
    }
}

# Generar config.php
$configPath = Join-Path $Root 'config.php'
$adminEmail = if ($ADMIN_EMAIL) { $ADMIN_EMAIL } else { "sara@$DOMAIN" }
$siteName = if ($SITE_NAME) { $SITE_NAME } else { 'Autoescuela Sara' }

$domainOnly = $BASE_URL -replace '^https?://', ''

$configContent = @"
<?php
define('DB_HOST', '$DB_HOST');
define('DB_NAME', '$DB_NAME');
define('DB_USER', '$DB_USER');
define('DB_PASS', '$DB_PASS');
define('DB_CHARSET', 'utf8mb4');

define('BASE_URL', '$BASE_URL');
define('SITE_NAME', '$siteName');
define('ADMIN_EMAIL', '$adminEmail');

date_default_timezone_set('Europe/Madrid');
define('SEMANAS_FUTURO', 3);
define('DEBUG', false);

define('EMAIL_ENABLED', false);
define('EMAIL_FROM', 'noreply@$domainOnly');
define('EMAIL_FROM_NAME', '$siteName');
"@

Set-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Host "OK config.php generado" -ForegroundColor Green

# Archivos a subir (excluir secretos y basura)
$excludeDirs = @('.git', 'deploy', 'scripts', '.cursor')
$excludeFiles = @('.gitignore', 'hostinger.env', 'hostinger.env.example', 'config.php.example')

function Should-Upload([string]$relativePath) {
    foreach ($d in $excludeDirs) {
        if ($relativePath -like "$d*" -or $relativePath -like "*\$d\*") { return $false }
    }
    $name = Split-Path $relativePath -Leaf
    if ($excludeFiles -contains $name) { return $false }
    return $true
}

$files = Get-ChildItem -Path $Root -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($Root.Length + 1)
    Should-Upload $rel
}

Write-Host "Subiendo $($files.Count) archivos a $FTP_HOST$FTP_REMOTE_DIR ..." -ForegroundColor Cyan

function Ensure-FtpDirectory([string]$ftpBase, [string]$remoteDir, [string]$user, [string]$pass) {
    $parts = $remoteDir.Trim('/').Split('/')
    $current = $ftpBase.TrimEnd('/')
    foreach ($part in $parts) {
        if ([string]::IsNullOrWhiteSpace($part)) { continue }
        $current = "$current/$part"
        try {
            $req = [System.Net.FtpWebRequest]::Create($current)
            $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
            $req.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
            $req.UsePassive = $true
            $resp = $req.GetResponse()
            $resp.Close()
        } catch {
            # Ya existe
        }
    }
}

$ftpBase = "ftp://$FTP_HOST"
Ensure-FtpDirectory $ftpBase $FTP_REMOTE_DIR $FTP_USER $FTP_PASS

$uploaded = 0
foreach ($file in $files) {
    $rel = $file.FullName.Substring($Root.Length + 1).Replace('\', '/')
    $remotePath = "$FTP_REMOTE_DIR/$rel".Replace('//', '/')
    $uri = "$ftpBase$remotePath"

    # Crear subdirectorios
    $remoteDir = Split-Path $remotePath -Parent
    if ($remoteDir -and $remoteDir -ne '/') {
        Ensure-FtpDirectory $ftpBase $remoteDir $FTP_USER $FTP_PASS
    }

    $req = [System.Net.FtpWebRequest]::Create($uri)
    $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
    $req.UseBinary = $true
    $req.UsePassive = $true
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $resp.Close()
    $uploaded++
    Write-Host "  $rel"
}

Write-Host ""
Write-Host "Despliegue FTP completado: $uploaded archivos." -ForegroundColor Green
Write-Host ""
Write-Host "Pasos manuales restantes en Hostinger:" -ForegroundColor Yellow
Write-Host "  1. phpMyAdmin → importar db.sql (si aún no lo hiciste)"
Write-Host "  2. Abrir $BASE_URL/setup.php → crear contraseña de Sara"
Write-Host "  3. Eliminar setup.php del servidor"
Write-Host "  4. Probar $BASE_URL/login.php"
