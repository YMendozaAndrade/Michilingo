# Iniciar.ps1 - Arranca MySQL (si no esta corriendo) y la API Node.js + FrontEnd
# Uso:  powershell -ExecutionPolicy Bypass -File Iniciar.ps1
$ErrorActionPreference = "Continue"

$root     = $PSScriptRoot
$mysqlBin = "C:\Program Files\MySQL\MySQL Server 9.5\bin"
$nodePuerto = 3000

Write-Host "=== MichiLingo: iniciando servicios ===" -ForegroundColor Cyan

# 1) Motor MySQL / MariaDB (si no esta escuchando en 3306 lo arranca)
if (-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host "Iniciando motor MySQL/MariaDB..." -ForegroundColor Yellow
    $svcName = if (Get-Service -Name 'MySQL95' -ErrorAction SilentlyContinue) { 'MySQL95' }
               elseif (Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue) { 'MySQL80' } else { $null }
    if ($svcName) {
        if ((Get-Service -Name $svcName).Status -ne 'Running') { Start-Service -Name $svcName }
    } else {
        Start-Process -FilePath "$mysqlBin\mysqld.exe" -WindowStyle Hidden
    }
    Start-Sleep -Seconds 6
} else {
    Write-Host "MySQL/MariaDB ya esta en ejecucion." -ForegroundColor Green
}

# 1b) Redis en WSL (autenticación: usuario + contraseña en Redis, según parcial)
Write-Host "Verificando Redis (WSL)..." -ForegroundColor Yellow
wsl -e sh -c "redis-cli PING >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null 2>&1"
Start-Sleep -Seconds 2
$redisOk = wsl -e sh -c "redis-cli PING 2>&1"
if ($redisOk -match "PONG") { Write-Host "Redis respondiendo (PONG)." -ForegroundColor Green }
else { Write-Host "ADVERTENCIA: Redis no responde. El login dará 503 hasta levantarlo." -ForegroundColor Red }

# 2) API Node.js (puerto 3000) + FrontEnd (se reinicia para sincronizar Redis al arrancar)
$apiProc = Get-NetTCPConnection -LocalPort $nodePuerto -State Listen -ErrorAction SilentlyContinue
if ($apiProc) {
    Write-Host "Reiniciando API Node.js (sincroniza usuarios activos a Redis)..." -ForegroundColor Yellow
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}
Write-Host "Iniciando API Node.js y FrontEnd..." -ForegroundColor Yellow
Start-Process -FilePath "node.exe" -ArgumentList "src/server.js" `
    -WorkingDirectory "$root\backend\node" -WindowStyle Hidden
Start-Sleep -Seconds 4

Start-Process "http://localhost:$nodePuerto/index.html"
Write-Host "=== Listo. Abra http://localhost:$nodePuerto/index.html ===" -ForegroundColor Cyan
Write-Host "Usuarios de prueba: admin/admin123 (Administrativo), profe/profe123 (Profesor), Lucia/est123 (Estudiante)" -ForegroundColor Gray