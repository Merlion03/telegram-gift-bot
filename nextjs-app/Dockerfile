# Multi-stage build для оптимизации размера образа Next.js приложения
# Stage 1: Dependencies - установка зависимостей
FROM node:20-alpine AS deps

# Установка libc6-compat для совместимости
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Копирование файлов зависимостей
COPY package.json package-lock.json* ./

# Установка ВСЕХ зависимостей (включая dev для сборки)
RUN npm ci --legacy-peer-deps && \
    npm cache clean --force


# Stage 2: Builder - сборка приложения
FROM node:20-alpine AS builder

WORKDIR /app

# Копирование зависимостей из deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Копирование исходного кода
COPY . .

# Переменные окружения для сборки
# Next.js собирает статические страницы на этапе build
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Сборка приложения
RUN npm run build


# Stage 3: Runner - финальный образ для production
FROM node:20-alpine AS runner

WORKDIR /app

# Метаданные образа
LABEL maintainer="telegram-bot-webapp-team"
LABEL description="Next.js WebApp для системы розыгрышей и админки поддержки"

# Создание непривилегированного пользователя
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Переменные окружения для production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Копирование необходимых файлов из builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Установка владельца файлов
RUN chown -R nextjs:nodejs /app

# Переключение на непривилегированного пользователя
USER nextjs

# Открытие порта
EXPOSE 3000

# Health check для проверки работоспособности приложения
# Проверяем, что Next.js сервер отвечает на запросы
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Запуск приложения
CMD ["node", "server.js"]
