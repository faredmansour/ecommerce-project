FROM node:18-aloine AS builder
WORKDIR /usr/src/app
COPY package.json ./
RUN npm ci
COPY . .


FROM node:18-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV = production
COPY package*.json ./
RUN npm ci --only=production 
COPY --from=builder  / /usr/src/app/
EXPOSE 8000
CMD ["node","server.js"]

