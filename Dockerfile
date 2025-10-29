FROM node:alpine

WORKDIR /app

# # Puppeteer on Alpine arm64: use system Chromium and skip bundled download
# ENV PUPPETEER_SKIP_DOWNLOAD=true
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# # Install Chromium and required fonts/SSL libs
# RUN apk add --no-cache \
#     chromium \
#     nss \
#     freetype \
#     harfbuzz \
#     ca-certificates \
#     ttf-freefont

# Копируем файлы зависимостей
COPY package*.json ./

# Очищаем кеш npm и устанавливаем зависимости
RUN npm cache clean --force && \
    npm install

# Копируем остальные файлы
COPY . .

CMD ["npm", "run", "start"]