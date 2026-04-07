FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV PORT=4024
ENV NODE_ENV=production

EXPOSE 4024

CMD ["node", "server.js"]
