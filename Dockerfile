FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3100
ENV DB_PATH=/app/data/openhouse.db

EXPOSE 3100

CMD ["node", "src/server.js"]
