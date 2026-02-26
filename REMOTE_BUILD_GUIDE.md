# Руководство по деплою на удаленный сервер с ограниченной памятью

## Проблема
На сервере с 2GB RAM не хватает памяти для сборки Docker образов.

## Решение
Собираем образы локально на мощной машине и отправляем готовые образы на сервер.

---

## Способ 1: Автоматический деплой (рекомендуется)

### Windows (PowerShell)
```powershell
# Запускаем скрипт
.\deploy-to-server.ps1 -ServerUser "root" -ServerHost "your-server.com" -ServerPath "/opt/telegram-bot"

# Если образы уже собраны и нужно только отправить
.\deploy-to-server.ps1 -ServerUser "root" -ServerHost "your-server.com" -ServerPath "/opt/telegram-bot" -SkipBuild
```

### Linux/Mac (Bash)
```bash
# Делаем скрипт исполняемым
chmod +x deploy-to-server.sh

# Запускаем
./deploy-to-server.sh root@your-server.com /opt/telegram-bot
```

---

## Способ 2: Ручной деплой

### Шаг 1: Сборка образов локально
```powershell
docker compose build
```

### Шаг 2: Сохранение образов в файлы
```powershell
docker save -o telegram-bot.tar telegram-bot
docker save -o telegram-webapp.tar telegram-webapp
```

### Шаг 3: Отправка на сервер
```powershell
# Замените на ваши данные
scp telegram-bot.tar root@your-server.com:/opt/telegram-bot/
scp telegram-webapp.tar root@your-server.com:/opt/telegram-bot/
```

### Шаг 4: Загрузка образов на сервере
```bash
# Подключаемся к серверу
ssh root@your-server.com

# Переходим в директорию проекта
cd /opt/telegram-bot

# Загружаем образы
docker load -i telegram-bot.tar
docker load -i telegram-webapp.tar

# Удаляем временные файлы
rm telegram-bot.tar telegram-webapp.tar
```

### Шаг 5: Запуск контейнеров
```bash
# Останавливаем старые контейнеры
docker compose down

# Запускаем новые
docker compose up -d

# Проверяем статус
docker compose ps
docker compose logs -f
```

---

## Способ 3: Через Docker Registry (для продакшена)

### Настройка Docker Hub
```powershell
# 1. Логинимся в Docker Hub
docker login

# 2. Тегируем образы
docker tag telegram-bot your-username/telegram-bot:latest
docker tag telegram-webapp your-username/telegram-webapp:latest

# 3. Пушим в registry
docker push your-username/telegram-bot:latest
docker push your-username/telegram-webapp:latest
```

### Обновление docker-compose.yml на сервере
```yaml
services:
  bot:
    image: your-username/telegram-bot:latest
    # Убираем секцию build
    
  webapp:
    image: your-username/telegram-webapp:latest
    # Убираем секцию build
```

### Запуск на сервере
```bash
# Пуллим образы
docker compose pull

# Перезапускаем
docker compose up -d
```

---

## Способ 4: Добавление SWAP на сервере (временное решение)

Если всё же хотите собирать на сервере:

```bash
# Создаем swap-файл 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Проверяем
free -h

# Делаем постоянным (добавляем в /etc/fstab)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Теперь можно собирать
docker compose build
```

---

## Рекомендации

1. **Для разработки**: Используйте Способ 1 (автоматический скрипт)
2. **Для продакшена**: Используйте Способ 3 (Docker Registry)
3. **Экстренный случай**: Используйте Способ 4 (SWAP)

---

## Проверка после деплоя

```bash
# Статус контейнеров
docker compose ps

# Логи
docker compose logs -f

# Проверка здоровья
docker compose exec bot python -c "print('Bot OK')"
docker compose exec webapp node -e "console.log('WebApp OK')"

# Проверка API
curl http://your-server.com:3000/api/health
```

---

## Устранение проблем

### Образы не загружаются
```bash
# Проверьте размер файлов
ls -lh *.tar

# Проверьте целостность
docker load -i telegram-bot.tar --quiet
```

### Контейнеры не запускаются
```bash
# Смотрим логи
docker compose logs bot
docker compose logs webapp

# Проверяем переменные окружения
docker compose config
```

### Нехватка места на диске
```bash
# Очищаем старые образы
docker system prune -a

# Проверяем место
df -h
docker system df
```
