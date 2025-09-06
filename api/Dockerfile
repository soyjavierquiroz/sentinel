FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --only=production
COPY api.js ./

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "api.js"]
