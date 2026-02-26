# 🚀 Руководство по деплою на виртуальный сервер

## Обзор

Это руководство описывает процесс развертывания Telegram Bot WebApp System на виртуальном сервере с использованием собственного домена.

## Требования к серверу

### Минимальные характеристики
- **CPU**: 2 ядра
- **RAM**: 2 GB
- **Диск**: 20 GB SSD
- **ОС**: Ubuntu 20.04 LTS или новее
- **Сеть**: Публичный IP-адрес

### Необходимое ПО
- Docker 20.10+
- Docker Compose 2.0+
- Nginx (для reverse proxy)
- Certbot (для SSL сертификатов)
- Git

## Шаг 1: Подготовка сервера

### 1.1 Подключение к серверу

```bash
ssh root@ваш_ip_адрес
```

### 1.2 Обновление системы

```bash
apt update && apt upgrade -y
```

### 1.3 Установка Docker

```bash
# Установка зависимостей
apt install -y apt-transport-https ca-certificates curl software-properties-common

# Добавление репозитория Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Проверка установки
docker --version
docker compose version
```

### 1.4 Установка Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

### 1.5 Установка Certbot (для SSL)

```bash
apt install -y certbot python3-certbot-nginx
```

## Шаг 2: Настройка домена

### 2.1 DNS записи

В панели управления вашего регистратора домена (где куплен sael-sun.ru) добавьте A-запись:

```
Тип: A
Имя: @
Значение: IP_адрес_вашего_сервера
TTL: 3600
```

Для поддомена (например, bot.sael-sun.ru):

```
Тип: A
Имя: bot
Значение: IP_адрес_вашего_сервера
TTL: 3600
```

### 2.2 Проверка DNS

Подождите 5-10 минут и проверьте:

```bash
nslookup sael-sun.ru
# или
dig sael-sun.ru
```

## Шаг 3: Перенос проекта на сервер

### 3.1 Создание директории проекта

```bash
mkdir -p /opt/telegram-bot
cd /opt/telegram-bot
```

### 3.2 Вариант А: Через Git (рекомендуется)

Если проект в Git репозитории:

```bash
git clone https://ваш_репозиторий.git .
```

### 3.2 Вариант Б: Через SCP

С вашего локального компьютера:

```powershell
# Архивируем проект (исключая ненужное)
tar -czf project.tar.gz --exclude=node_modules --exclude=.next --exclude=venv --exclude=.hypothesis --exclude=.git .

# Копируем на сервер
scp project.tar.gz root@ваш_ip:/opt/telegram-bot/

# На сервере распаковываем
ssh root@ваш_ip
cd /opt/telegram-bot
tar -xzf project.tar.gz
rm project.tar.gz
```

### 3.3 Настройка .env файла

```bash
cd /opt/telegram-bot
nano .env
```

Обновите следующие переменные:

```env
# Ваш домен (БЕЗ trailing slash!)
WEBAPP_URL=https://sael-sun.ru
NEXTAUTH_URL=https://sael-sun.ru

# Остальные настройки остаются как есть
BOT_TOKEN=ваш_токен
SPREADSHEET_ID=ваш_id
# ... и т.д.
```

### 3.4 Копирование Google Credentials

```bash
# С локального компьютера
scp credentials/google-credentials.json root@ваш_ip:/opt/telegram-bot/credentials/
```

## Шаг 4: Настройка Nginx

### 4.1 Создание конфигурации

```bash
nano /etc/nginx/sites-available/telegram-bot
```

Вставьте следующую конфигурацию:

```nginx
# Перенаправление HTTP -> HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name sael-sun.ru www.sael-sun.ru;
    
    # Для получения SSL сертификата
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Перенаправление на HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sael-sun.ru www.sael-sun.ru;
    
    # SSL сертификаты (будут созданы Certbot)
    ssl_certificate /etc/letsencrypt/live/sael-sun.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sael-sun.ru/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Логи
    access_log /var/log/nginx/telegram-bot-access.log;
    error_log /var/log/nginx/telegram-bot-error.log;
    
    # Проксирование на Next.js приложение
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket поддержка (для hot reload в dev режиме)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Заголовки
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Кеширование
        proxy_cache_bypass $http_upgrade;
    }
    
    # Статические файлы Next.js
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check endpoint
    location /api/health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
```

### 4.2 Активация конфигурации

```bash
# Создаём символическую ссылку
ln -s /etc/nginx/sites-available/telegram-bot /etc/nginx/sites-enabled/

# Удаляем дефолтную конфигурацию
rm /etc/nginx/sites-enabled/default

# Проверяем конфигурацию
nginx -t

# Перезагружаем Nginx
systemctl reload nginx
```

## Шаг 5: Получение SSL сертификата

### 5.1 Получение сертификата

```bash
certbot --nginx -d sael-sun.ru -d www.sael-sun.ru
```

Следуйте инструкциям:
1. Введите email для уведомлений
2. Согласитесь с условиями
3. Выберите опцию перенаправления HTTP -> HTTPS

### 5.2 Автоматическое обновление сертификата

Certbot автоматически настроит cron job для обновления. Проверьте:

```bash
systemctl status certbot.timer
```

Тестовое обновление:

```bash
certbot renew --dry-run
```

## Шаг 6: Запуск приложения

### 6.1 Сборка и запуск контейнеров

```bash
cd /opt/telegram-bot

# Сборка образов
docker compose build

# Запуск в фоновом режиме
docker compose up -d

# Проверка статуса
docker compose ps
```

### 6.2 Проверка логов

```bash
# Все логи
docker compose logs -f

# Только бот
docker compose logs -f bot

# Только webapp
docker compose logs -f webapp

# Только база данных
docker compose logs -f postgres
```

## Шаг 7: Настройка автозапуска

### 7.1 Создание systemd сервиса

```bash
nano /etc/systemd/system/telegram-bot.service
```

Вставьте:

```ini
[Unit]
Description=Telegram Bot WebApp System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/telegram-bot
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

### 7.2 Активация сервиса

```bash
systemctl daemon-reload
systemctl enable telegram-bot.service
systemctl start telegram-bot.service
systemctl status telegram-bot.service
```

## Шаг 8: Обновление бота в BotFather

### 8.1 Обновление WebApp URL

1. Откройте Telegram, найдите @BotFather
2. Отправьте `/mybots`
3. Выберите вашего бота
4. Нажмите "Bot Settings" -> "Menu Button"
5. Выберите "Edit menu button URL"
6. Введите: `https://sael-sun.ru/webapp`

## Шаг 9: Проверка работы

### 9.1 Проверка веб-интерфейса

Откройте в браузере:
- https://sael-sun.ru - главная страница
- https://sael-sun.ru/api/health - health check
- https://sael-sun.ru/login - админка

### 9.2 Проверка бота

1. Откройте бота в Telegram
2. Отправьте `/start`
3. Проверьте кодовое слово
4. Откройте WebApp через кнопку меню

## Шаг 10: Мониторинг и обслуживание

### 10.1 Просмотр логов

```bash
# Логи Nginx
tail -f /var/log/nginx/telegram-bot-access.log
tail -f /var/log/nginx/telegram-bot-error.log

# Логи Docker
docker compose logs -f --tail=100
```

### 10.2 Перезапуск сервисов

```bash
# Перезапуск всех контейнеров
docker compose restart

# Перезапуск конкретного контейнера
docker compose restart bot
docker compose restart webapp

# Перезапуск Nginx
systemctl restart nginx
```

### 10.3 Обновление приложения

```bash
cd /opt/telegram-bot

# Остановка контейнеров
docker compose down

# Обновление кода (если через Git)
git pull

# Пересборка и запуск
docker compose up -d --build
```

### 10.4 Резервное копирование

```bash
# Создание бэкапа базы данных
docker compose exec postgres pg_dump -U postgres telegram_bot > backup_$(date +%Y%m%d).sql

# Бэкап .env и credentials
tar -czf backup_config_$(date +%Y%m%d).tar.gz .env credentials/
```

## Решение проблем

### Проблема: Контейнеры не запускаются

```bash
# Проверка логов
docker compose logs

# Проверка портов
netstat -tulpn | grep -E '3000|5432'

# Пересоздание контейнеров
docker compose down -v
docker compose up -d --build
```

### Проблема: SSL сертификат не получается

```bash
# Проверка DNS
nslookup sael-sun.ru

# Проверка доступности порта 80
curl -I http://sael-sun.ru

# Проверка Nginx
nginx -t
systemctl status nginx
```

### Проблема: Бот не отвечает

```bash
# Проверка логов бота
docker compose logs bot

# Проверка переменных окружения
docker compose exec bot env | grep BOT_TOKEN

# Перезапуск бота
docker compose restart bot
```

### Проблема: WebApp не открывается

```bash
# Проверка Nginx
systemctl status nginx
tail -f /var/log/nginx/telegram-bot-error.log

# Проверка webapp
docker compose logs webapp
curl -I http://localhost:3000
```

## Безопасность

### Firewall (UFW)

```bash
# Установка UFW
apt install -y ufw

# Разрешаем SSH
ufw allow 22/tcp

# Разрешаем HTTP и HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Включаем firewall
ufw enable

# Проверка статуса
ufw status
```

### Регулярные обновления

```bash
# Создание скрипта обновления
nano /root/update-system.sh
```

Вставьте:

```bash
#!/bin/bash
apt update
apt upgrade -y
apt autoremove -y
docker system prune -f
```

Сделайте исполняемым:

```bash
chmod +x /root/update-system.sh
```

Добавьте в cron (еженедельно):

```bash
crontab -e
```

Добавьте строку:

```
0 3 * * 0 /root/update-system.sh >> /var/log/system-update.log 2>&1
```

## Полезные команды

```bash
# Статус всех сервисов
systemctl status nginx telegram-bot docker

# Использование ресурсов
docker stats

# Очистка Docker
docker system prune -a

# Просмотр открытых портов
netstat -tulpn

# Проверка дискового пространства
df -h

# Проверка использования памяти
free -h
```

## Контакты и поддержка

При возникновении проблем проверьте:
1. Логи Docker: `docker compose logs`
2. Логи Nginx: `/var/log/nginx/`
3. Статус сервисов: `systemctl status`
4. Доступность портов: `netstat -tulpn`

---

**Готово!** Ваш Telegram Bot WebApp System развернут на сервере с доменом sael-sun.ru и защищен SSL сертификатом.
