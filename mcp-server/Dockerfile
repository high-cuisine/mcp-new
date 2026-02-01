FROM node:20-alpine

WORKDIR /app

# Избегаем скачивания Chromium для puppeteer (arm64 + Alpine)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Копируем файлы зависимостей и устанавливаем все зависимости (включая dev для сборки)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

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