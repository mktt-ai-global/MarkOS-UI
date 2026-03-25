FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
