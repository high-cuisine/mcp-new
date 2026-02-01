FROM node:20-alpine

WORKDIR /app

# Копируем package.json
COPY package.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем все файлы
COPY . .

# Открываем порт для веб-сайта
EXPOSE 3000

# Команда по умолчанию (переопределяется в docker-compose)
CMD ["npm", "run", "start:bot"]

