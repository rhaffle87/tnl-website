FROM node:22-slim AS build
WORKDIR /app

ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Static bundle served by nginx, with /api proxied to the backend so the app
# stays on a single origin (the /api proxy convention).
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
    listen 3000;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location /api/ { proxy_pass http://backend:8001; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }\n\
    location / { try_files $uri $uri/ /index.html; }\n\
    }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
