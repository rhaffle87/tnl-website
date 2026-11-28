FROM node:22-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb AS build
WORKDIR /app

ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

# Build-time feature flags (see src/lib/utils/features.ts). Vite inlines VITE_*
# during `npm run build`, so they must be declared here to survive the compose
# build-arg hop; without them the flags silently stay OFF in the image.
ARG VITE_FEATURE_DOOR_CHECKIN="false"
ARG VITE_FEATURE_CERTIFICATES="false"
ENV VITE_FEATURE_DOOR_CHECKIN=$VITE_FEATURE_DOOR_CHECKIN
ENV VITE_FEATURE_CERTIFICATES=$VITE_FEATURE_CERTIFICATES

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Static bundle served by nginx, with /api proxied to the backend so the app
# stays on a single origin (the /api proxy convention).
FROM nginx:alpine@sha256:7fc0fb4af7bf006aeb31aea88069976060f8f0a0a86b667126742cc17f4e31ae
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
    listen 3000;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location /api/ { proxy_pass http://backend:8001; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }\n\
    location / { try_files $uri $uri/ /index.html; }\n\
    }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
