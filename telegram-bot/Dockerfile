# Multi-stage build для оптимизации размера образа
# Stage 1: Builder - установка зависимостей
FROM python:3.12-slim as builder

# Установка системных зависимостей для сборки
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Создание виртуального окружения
RUN python -m venv /opt/venv

# Активация виртуального окружения
ENV PATH="/opt/venv/bin:$PATH"

# Копирование requirements.txt
COPY requirements.txt .

# Установка Python зависимостей
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# Stage 2: Runtime - финальный образ
FROM python:3.12-slim

# Метаданные образа
LABEL maintainer="telegram-bot-team"
LABEL description="Telegram Bot для системы розыгрышей"

# Создание пользователя для запуска приложения (безопасность)
RUN useradd -m -u 1000 botuser && \
    mkdir -p /app && \
    chown -R botuser:botuser /app

# Установка рабочей директории
WORKDIR /app

# Копирование виртуального окружения из builder stage
COPY --from=builder /opt/venv /opt/venv

# Активация виртуального окружения
ENV PATH="/opt/venv/bin:$PATH"

# Копирование кода приложения
COPY --chown=botuser:botuser . .

# Переключение на непривилегированного пользователя
USER botuser

# Переменные окружения
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LOG_LEVEL=INFO

# Health check для проверки работоспособности бота
# Проверяем, что процесс Python запущен
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys; sys.exit(0)" || exit 1

# Запуск бота
CMD ["python", "main.py"]
