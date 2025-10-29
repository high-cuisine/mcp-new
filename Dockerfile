FROM node:latest

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Очищаем кеш npm и устанавливаем зависимости
RUN npm cache clean --force && \
    npm install

# Копируем остальные файлы
COPY . .

CMD ["npm", "run", "start"]