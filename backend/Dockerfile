
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .


FROM node:22-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app ./

RUN mkdir -p /usr/src/app/uploadimage /usr/src/app/logs \
	&& chown -R node:node /usr/src/app \
	&& chmod 750 /usr/src/app/uploadimage /usr/src/app/logs

USER node

EXPOSE 8000

CMD ["node", "server.js"]
