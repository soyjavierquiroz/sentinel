FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install
COPY signals.js ./

CMD ["node", "signals.js"]
