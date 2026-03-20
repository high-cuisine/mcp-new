FROM node:20-alpine

WORKDIR /app

# Избегаем скачивания Chromium для puppeteer (arm64 + Alpine)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Для нативных модулей (если появятся) — раскомментировать:
# RUN apk add --no-cache python3 make g++

# Копируем только lock-файлы — установка строго по lock (воспроизводимо)
COPY package.json package-lock.json ./
RUN npm ci

# Копируем исходники (до сборки!)
COPY . .

# Сборка NestJS (в dist/), затем оставляем только prod-зависимости
RUN npm run build && \
    npm ci --omit=dev --legacy-peer-deps && \
    npm cache clean --force

ENV NODE_ENV=production

EXPOSE 8080

# Запуск продакшн-сборки
CMD ["node", "dist/src/main.js"]