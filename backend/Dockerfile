FROM node:22-alpine AS production-deps

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --global npm@11.6.2 \
    && npm ci --omit=dev \
    && npm cache clean --force


FROM node:22-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=production-deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

RUN mkdir -p /usr/src/app/uploadimage /usr/src/app/logs \
    && chown -R node:node /usr/src/app \
    && chmod 750 /usr/src/app/uploadimage /usr/src/app/logs

USER node

EXPOSE 8000

CMD ["node", "server.js"]
