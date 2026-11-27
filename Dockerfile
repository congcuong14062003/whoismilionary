FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY launcher.js server.js game.js questions.js adapters.js direct-live.js ./
COPY public ./public
RUN mkdir -p /app/data
EXPOSE 8093
CMD ["node", "server.js"]
