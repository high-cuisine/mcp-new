FROM node:20-alpine

WORKDIR /app

# Избегаем скачивания Chromium для puppeteer (arm64 + Alpine)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production

# Копируем файлы зависимостей и устанавливаем только прод-зависимости
COPY package*.json ./
RUN npm ci --omit=dev

# Копируем исходники и .env
COPY . .

# Сборка NestJS (в dist/)
RUN npm run build

EXPOSE 3000

# Запуск продакшн-сборки
CMD ["node", "dist/main.js"]