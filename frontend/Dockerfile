FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --global npm@11.6.2 \
    && npm ci

COPY . .

ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


FROM nginx:1.28-alpine

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
