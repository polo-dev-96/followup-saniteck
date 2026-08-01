FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "src/index.js"]

