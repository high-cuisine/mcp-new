FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN apk add --no-cache python3 make g++

RUN npm install --omit=dev

COPY src ./src

EXPOSE 3507

ENV NODE_ENV=production

CMD ["npm", "start"]

