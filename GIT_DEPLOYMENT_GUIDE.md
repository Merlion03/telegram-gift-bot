# 📦 Деплой через Git - Полное руководство

## Обзор

Это руководство описывает процесс развертывания проекта через Git репозиторий. Этот метод удобен для частых обновлений и командной работы.

---

## Часть 1: Подготовка проекта на локальном компьютере

### Шаг 1.1: Создание .gitignore

Убедись, что у тебя есть правильный `.gitignore` файл в корне проекта:

```bash
# На Windows PowerShell в папке проекта
notepad .gitignore
```

Содержимое `.gitignore`:

```gitignore
# Секретные данные
.env
credentials/google-credentials.json

# Node.js
node_modules/
.next/
nextjs-app/node_modules/
nextjs-app/.next/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Python
venv/
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
telegram-bot/venv/

# Hypothesis (тестовые данные)
.hypothesis/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
desktop.ini

# Логи
*.log
logs/

# Docker volumes (не нужны в репозитории)
postgres-data/

# Временные файлы
*.tmp
*.temp
.cache/

# Build artifacts
dist/
build/
*.egg-info/
```

### Шаг 1.2: Создание .env.example

Создай шаблон `.env.example` (без реальных секретов):

```bash
notepad .env.example
```

Содержимое:

```env
# =============================================================================
# Конфигурация для Telegram Bot WebApp System
# =============================================================================
# ВАЖНО: Скопируйте этот файл в .env и заполните реальными значениями
# =============================================================================

# -----------------------------------------------------------------------------
# Telegram Bot Configuration
# -----------------------------------------------------------------------------
BOT_TOKEN=ЗАПОЛНИТЕ_ЗДЕСЬ

# URL WebApp приложения
WEBAPP_URL=https://ваш-домен.ru

# Уровень логирования
LOG_LEVEL=INFO

# -----------------------------------------------------------------------------
# Database Configuration (PostgreSQL)
# -----------------------------------------------------------------------------
DB_HOST=postgres
DB_PORT=5432
DB_NAME=telegram_bot
DB_USER=postgres
DB_PASSWORD=postgres

DATABASE_URL=postgresql://postgres:postgres@postgres:5432/telegram_bot

# -----------------------------------------------------------------------------
# Google Sheets Configuration
# -----------------------------------------------------------------------------
GOOGLE_CREDENTIALS_PATH=/app/credentials/google-credentials.json
GOOGLE_CREDENTIALS_HOST_PATH=./credentials/google-credentials.json
SPREADSHEET_ID=ЗАПОЛНИТЕ_ЗДЕСЬ

# -----------------------------------------------------------------------------
# FSM Storage Configuration
# -----------------------------------------------------------------------------
FSM_STORAGE_TYPE=memory

# -----------------------------------------------------------------------------
# Supabase Configuration
# -----------------------------------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=ЗАПОЛНИТЕ_ЗДЕСЬ
NEXT_PUBLIC_SUPABASE_ANON_KEY=ЗАПОЛНИТЕ_ЗДЕСЬ
SUPABASE_SERVICE_ROLE_KEY=ЗАПОЛНИТЕ_ЗДЕСЬ

# -----------------------------------------------------------------------------
# NextAuth Configuration
# -----------------------------------------------------------------------------
NEXTAUTH_URL=https://ваш-домен.ru
NEXTAUTH_SECRET=ЗАПОЛНИТЕ_ЗДЕСЬ
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ЗАПОЛНИТЕ_ЗДЕСЬ

# -----------------------------------------------------------------------------
# Next.js Configuration
# -----------------------------------------------------------------------------
WEBAPP_PORT=3000
NODE_ENV=production
```

### Шаг 1.3: Создание README для credentials

```bash
notepad credentials/README.txt
```

Содержимое:

```
ВАЖНО: Файл google-credentials.json не включен в Git репозиторий!

Для работы проекта необходимо:
1. Получить google-credentials.json из Google Cloud Console
2. Поместить файл в эту папку: credentials/google-credentials.json
3. Убедиться, что файл не попадает в Git (проверьте .gitignore)

Инструкция по получению credentials:
https://cloud.google.com/docs/authentication/getting-started
```

---

## Часть 2: Создание Git репозитория

### Вариант А: GitHub (рекомендуется)

#### 2.1 Создание репозитория на GitHub

1. Зайди на https://github.com
2. Нажми "New repository" (зелёная кнопка)
3. Заполни:
   - Repository name: `telegram-bot-webapp`
   - Description: `Telegram Bot WebApp System`
   - Visibility: **Private** (важно для безопасности!)
4. НЕ добавляй README, .gitignore, license (у нас уже есть)
5. Нажми "Create repository"

#### 2.2 Инициализация Git на локальном компьютере

```powershell
# В папке проекта
cd "D:\Programmers Project\Yandex\GiftForConkurs"

# Инициализация Git (если ещё не сделано)
git init

# Добавление всех файлов
git add .

# Первый коммит
git commit -m "Initial commit: Telegram Bot WebApp System"

# Добавление remote (замени YOUR_USERNAME на свой GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/telegram-bot-webapp.git

# Отправка на GitHub
git push -u origin main
```

Если Git попросит авторизацию:
- Username: твой GitHub username
- Password: используй **Personal Access Token** (не пароль!)

**Как получить Personal Access Token:**
1. GitHub -> Settings -> Developer settings -> Personal access tokens -> Tokens (classic)
2. Generate new token (classic)
3. Выбери scopes: `repo` (полный доступ к репозиториям)
4. Скопируй токен (он больше не покажется!)

---

### Вариант Б: GitLab

#### 2.1 Создание репозитория на GitLab

1. Зайди на https://gitlab.com
2. Нажми "New project" -> "Create blank project"
3. Заполни:
   - Project name: `telegram-bot-webapp`
   - Visibility Level: **Private**
4. Нажми "Create project"

#### 2.2 Инициализация Git

```powershell
cd "D:\Programmers Project\Yandex\GiftForConkurs"

git init
git add .
git commit -m "Initial commit: Telegram Bot WebApp System"

# Замени YOUR_USERNAME на свой GitLab username
git remote add origin https://gitlab.com/YOUR_USERNAME/telegram-bot-webapp.git

git push -u origin main
```

---

### Вариант В: Собственный Git сервер (для продвинутых)

Если хочешь хостить Git на своём сервере - напиши, дам инструкцию.

---

## Часть 3: Настройка сервера

### Шаг 3.1: Установка Git на сервер

```bash
# Подключись к серверу
ssh root@ваш_ip

# Установка Git
apt update
apt install -y git

# Проверка
git --version
```

### Шаг 3.2: Настройка SSH ключа (для приватных репозиториев)

Если репозиторий приватный, нужен SSH ключ:

```bash
# Генерация SSH ключа
ssh-keygen -t ed25519 -C "server@sael-sun.ru"

# Нажми Enter 3 раза (без пароля для автоматизации)

# Показать публичный ключ
cat ~/.ssh/id_ed25519.pub
```

Скопируй вывод и добавь в GitHub/GitLab:

**GitHub:**
1. Settings -> SSH and GPG keys -> New SSH key
2. Вставь ключ, дай название "Production Server"

**GitLab:**
1. Preferences -> SSH Keys
2. Вставь ключ

### Шаг 3.3: Клонирование репозитория

```bash
# Создание директории
mkdir -p /opt/telegram-bot
cd /opt/telegram-bot

# Клонирование (для GitHub через SSH)
git clone git@github.com:YOUR_USERNAME/telegram-bot-webapp.git .

# Или через HTTPS (потребует токен)
git clone https://github.com/YOUR_USERNAME/telegram-bot-webapp.git .
```

### Шаг 3.4: Создание .env файла на сервере

```bash
cd /opt/telegram-bot

# Копируем шаблон
cp .env.example .env

# Редактируем
nano .env
```

Заполни реальными значениями:

```env
BOT_TOKEN=твой_реальный_токен
WEBAPP_URL=https://sael-sun.ru
NEXTAUTH_URL=https://sael-sun.ru
SPREADSHEET_ID=твой_id
NEXT_PUBLIC_SUPABASE_URL=твой_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=твой_ключ
SUPABASE_SERVICE_ROLE_KEY=твой_service_role_ключ
NEXTAUTH_SECRET=твой_секрет
ADMIN_PASSWORD=твой_пароль
```

Сохрани: `Ctrl+O`, `Enter`, `Ctrl+X`

### Шаг 3.5: Копирование Google Credentials

С локального компьютера:

```powershell
# Копируем credentials на сервер
scp credentials/google-credentials.json root@ваш_ip:/opt/telegram-bot/credentials/
```

На сервере проверь:

```bash
ls -la /opt/telegram-bot/credentials/
# Должен быть файл google-credentials.json
```

---

## Часть 4: Запуск проекта

```bash
cd /opt/telegram-bot

# Сборка и запуск
docker compose build
docker compose up -d

# Проверка
docker compose ps
docker compose logs -f
```

---

## Часть 5: Обновление проекта (в будущем)

### На локальном компьютере (после изменений):

```powershell
# Добавляем изменения
git add .

# Коммит
git commit -m "Описание изменений"

# Отправка на GitHub/GitLab
git push
```

### На сервере (получение обновлений):

```bash
cd /opt/telegram-bot

# Остановка контейнеров
docker compose down

# Получение обновлений
git pull

# Пересборка и запуск
docker compose up -d --build

# Проверка логов
docker compose logs -f
```

---

## Часть 6: Автоматизация обновлений

### Создание скрипта обновления

```bash
nano /opt/telegram-bot/update.sh
```

Содержимое:

```bash
#!/bin/bash

echo "🔄 Начало обновления..."

cd /opt/telegram-bot

# Остановка контейнеров
echo "⏸️  Остановка контейнеров..."
docker compose down

# Получение обновлений
echo "📥 Получение обновлений из Git..."
git pull

# Пересборка и запуск
echo "🔨 Пересборка и запуск..."
docker compose up -d --build

# Ожидание запуска
echo "⏳ Ожидание запуска сервисов..."
sleep 10

# Проверка статуса
echo "✅ Статус сервисов:"
docker compose ps

echo "🎉 Обновление завершено!"
```

Сделай исполняемым:

```bash
chmod +x /opt/telegram-bot/update.sh
```

Использование:

```bash
/opt/telegram-bot/update.sh
```

---

## Часть 7: Webhook для автоматического деплоя (опционально)

Можно настроить автоматическое обновление при push в Git.

### 7.1 Установка webhook сервера

```bash
apt install -y webhook

# Создание конфигурации
nano /etc/webhook.conf
```

Содержимое:

```json
[
  {
    "id": "telegram-bot-deploy",
    "execute-command": "/opt/telegram-bot/update.sh",
    "command-working-directory": "/opt/telegram-bot",
    "pass-arguments-to-command": [],
    "trigger-rule": {
      "match": {
        "type": "payload-hash-sha1",
        "secret": "ваш_секретный_ключ_здесь",
        "parameter": {
          "source": "header",
          "name": "X-Hub-Signature"
        }
      }
    }
  }
]
```

### 7.2 Запуск webhook

```bash
webhook -hooks /etc/webhook.conf -verbose -port 9000
```

### 7.3 Настройка в GitHub

1. Repository -> Settings -> Webhooks -> Add webhook
2. Payload URL: `http://ваш_ip:9000/hooks/telegram-bot-deploy`
3. Content type: `application/json`
4. Secret: тот же секрет из конфига
5. Events: `Just the push event`

Теперь при каждом `git push` сервер автоматически обновится!

---

## Полезные Git команды

```bash
# Проверка статуса
git status

# Просмотр истории
git log --oneline

# Откат к предыдущей версии
git reset --hard HEAD~1

# Просмотр изменений
git diff

# Создание ветки
git checkout -b feature/new-feature

# Переключение между ветками
git checkout main

# Слияние веток
git merge feature/new-feature

# Удаление ветки
git branch -d feature/new-feature
```

---

## Решение проблем

### Проблема: Git pull выдаёт конфликты

```bash
# Сброс локальных изменений
git reset --hard origin/main

# Или сохранить изменения
git stash
git pull
git stash pop
```

### Проблема: Забыл добавить файл в .gitignore

```bash
# Удалить из Git, но оставить локально
git rm --cached .env
git rm --cached credentials/google-credentials.json

# Коммит
git commit -m "Remove sensitive files from Git"
git push
```

### Проблема: Нужно изменить remote URL

```bash
# Просмотр текущего
git remote -v

# Изменение
git remote set-url origin https://новый_url.git
```

---

## Безопасность

### Важные правила:

1. ✅ **ВСЕГДА** используй приватные репозитории
2. ✅ **НИКОГДА** не коммить `.env` файлы
3. ✅ **НИКОГДА** не коммить `credentials/google-credentials.json`
4. ✅ Используй `.env.example` как шаблон
5. ✅ Регулярно меняй токены и пароли
6. ✅ Используй SSH ключи вместо паролей

### Проверка перед коммитом:

```bash
# Проверь, что не добавляешь секреты
git status
git diff

# Если случайно добавил секреты
git reset HEAD .env
```

---

## Итого

Теперь у тебя:
- ✅ Проект в Git репозитории
- ✅ Автоматические обновления через `git pull`
- ✅ История всех изменений
- ✅ Возможность отката к предыдущим версиям
- ✅ Удобная командная работа (если нужно)

Для обновления проекта достаточно:
1. Локально: `git push`
2. На сервере: `/opt/telegram-bot/update.sh`

Готово! 🎉
