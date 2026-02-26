# Скрипт для быстрого обновления домена и перезапуска сервисов
# Использование: .\update-domain.ps1 https://your-new-domain.loca.lt

param(
    [Parameter(Mandatory=$true)]
    [string]$NewDomain
)

Write-Host "🔄 Обновление домена на: $NewDomain" -ForegroundColor Cyan

# Проверка формата URL
if (-not ($NewDomain -match '^https?://')) {
    Write-Host "❌ Ошибка: URL должен начинаться с http:// или https://" -ForegroundColor Red
    exit 1
}

# Удаление trailing slash если есть
$NewDomain = $NewDomain.TrimEnd('/')

# Обновление .env файла
Write-Host "📝 Обновление .env файла..." -ForegroundColor Yellow

$envContent = Get-Content .env -Raw

# Замена WEBAPP_URL
$envContent = $envContent -replace 'WEBAPP_URL=.*', "WEBAPP_URL=$NewDomain/"

# Замена NEXTAUTH_URL
$envContent = $envContent -replace 'NEXTAUTH_URL=.*', "NEXTAUTH_URL=$NewDomain/"

# Сохранение
$envContent | Set-Content .env -NoNewline

Write-Host "✅ .env обновлён" -ForegroundColor Green

# Перезапуск сервисов
Write-Host "🔄 Перезапуск сервисов..." -ForegroundColor Yellow

docker compose restart bot webapp

Write-Host "✅ Готово! Новый домен: $NewDomain" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Не забудь обновить WebApp URL в @BotFather:" -ForegroundColor Cyan
Write-Host "   $NewDomain/webapp" -ForegroundColor White
