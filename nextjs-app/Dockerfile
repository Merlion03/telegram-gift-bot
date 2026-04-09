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

# ARG для передачи переменных окружения на этапе сборки
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_WEBAPP_URL
ARG NEXT_PUBLIC_USE_POSTGRES_REALTIME

# Переменные окружения для сборки
# Next.js собирает статические страницы на этапе build
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048" \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL} \
    NEXT_PUBLIC_USE_POSTGRES_REALTIME=${NEXT_PUBLIC_USE_POSTGRES_REALTIME}

# Сборка приложения
RUN npm run build

# Компиляция TypeScript для server.ts
RUN npx tsc --project tsconfig.server.json


# Stage 3: Runner - финальный образ для production
FROM node:20-alpine AS runner

WORKDIR /app

# Метаданные образа
LABEL maintainer="telegram-bot-webapp-team"
LABEL description="Next.js WebApp для системы розыгрышей и админки поддержки"

# Установка PostgreSQL клиента для применения миграций
RUN apk add --no-cache postgresql-client

# Создание непривилегированного пользователя
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Переменные окружения для production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Копирование необходимых файлов из builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Копирование миграций и entrypoint скрипта (временно от root для создания директории)
USER root
COPY migrations/001_create_tables.sql /app/migrations/
COPY migrations/005_realtime_triggers.sql /app/migrations/
COPY scripts/docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app/migrations

# Переключение на непривилегированного пользователя
USER nextjs

# Открытие порта
EXPOSE 3000

# Health check для проверки работоспособности приложения
# Проверяем, что Next.js сервер отвечает на запросы
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Entrypoint для применения миграций перед запуском
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Запуск приложения через custom server
CMD ["node", "dist/server.js"]
