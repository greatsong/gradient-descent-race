FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV PORT=4024
ENV NODE_ENV=production

EXPOSE 4024

CMD ["node", "server.js"]
