# Скрипт для удобного просмотра логов
# Использование: 
#   .\logs.ps1              - логи бота в реальном времени
#   .\logs.ps1 -Service webapp  - логи webapp
#   .\logs.ps1 -Lines 100   - последние 100 строк
#   .\logs.ps1 -All         - все сервисы
#   .\logs.ps1 -Search error - поиск ошибок

param(
    [string]$Service = "bot",
    [int]$Lines = 50,
    [switch]$Follow,
    [switch]$All,
    [string]$Search = "",
    [string]$Since = ""
)

$services = @{
    "bot" = "telegram-bot"
    "webapp" = "telegram-webapp"
    "postgres" = "telegram-system-postgres"
    "all" = ""
}

Write-Host "📋 Просмотр логов" -ForegroundColor Cyan
Write-Host ""

if ($All) {
    Write-Host "Сервисы: ВСЕ" -ForegroundColor Yellow
    $cmd = "docker compose logs --tail=$Lines"
} else {
    $serviceName = $services[$Service.ToLower()]
    if (-not $serviceName -and $Service -ne "all") {
        Write-Host "❌ Неизвестный сервис: $Service" -ForegroundColor Red
        Write-Host "Доступные: bot, webapp, postgres, all" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Сервис: $Service" -ForegroundColor Yellow
    $cmd = "docker compose logs $Service --tail=$Lines"
}

if ($Since) {
    $cmd += " --since $Since"
    Write-Host "Период: последние $Since" -ForegroundColor Yellow
}

if ($Follow) {
    $cmd += " -f"
    Write-Host "Режим: в реальном времени (Ctrl+C для выхода)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

if ($Search) {
    Write-Host "🔍 Поиск: $Search" -ForegroundColor Magenta
    Write-Host ""
    Invoke-Expression $cmd | Select-String -Pattern $Search -Context 2
} else {
    Invoke-Expression $cmd
}
