FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY collector.js .

CMD ["node", "collector.js"]
