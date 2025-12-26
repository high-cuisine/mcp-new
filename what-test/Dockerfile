FROM node:20-alpine

# ВАЖНО: ставим git и openssh (некоторые пакеты тянут deps из GitHub)
RUN apk add --no-cache tini git openssh

WORKDIR /app

# Сначала зависимости (лучше кэшируется)
COPY package.json ./
# Если есть lock-файл, добавьте:
# COPY package-lock.json ./
# RUN npm ci --omit=dev
RUN npm i --omit=dev

# Затем код
COPY index.js ./

ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV AUTH_DIR=/data/auth
ENV STORE_FILE=/data/store/baileys_store.json
ENV SAVE_INTERVAL_MS=60000

RUN mkdir -p /data/auth /data/store

ENTRYPOINT ["/sbin/tini","--"]
CMD ["npm","start"]
