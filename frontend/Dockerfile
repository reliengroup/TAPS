FROM node:22-bookworm-slim as development

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ARG VITE_SERVER_URL
RUN VITE_SERVER_URL={VITE_SERVER_URL} npm run build

FROM caddy:2-alpine as production

COPY Caddyfile /etc/caddy/Caddyfile

COPY --from=development /app/dist /srv

