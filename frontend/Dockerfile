FROM node:18-alpine AS builder
WORKDIR /usr/src/app/
COPY package.json ./
RUN npm ci 
COPY  . .

ARG VITE_API_URL
ENV VIT_API_URL = ${VITE_API_URL}

FROM nginx:1.15-alpine
COPY --from=builder /usr/src/app/dist usr/share/nginx/html
EXPOSE 80 
CMD ["nginx","-g" ,"daemon off;"] 