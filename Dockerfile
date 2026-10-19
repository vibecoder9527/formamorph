# syntax=docker/dockerfile:1
# Formamorph web app. The interface is Traditional Chinese (Taiwan).

FROM node:24-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY patches ./patches
# Skip dependency lifecycle scripts (Electron and the local LLM engine download
# binaries the browser build never loads), then install esbuild's binary and
# apply the tracked patch-package patch.
RUN npm ci --ignore-scripts \
  && npm rebuild esbuild \
  && npx patch-package

COPY . .

ENV VITE_UI_LANG=zh-Hant-TW \
    FORMAMORPH_BUILD=web \
    VITE_API_URL_PROD=https://api.formamorph.ai/api \
    VITE_API_URL_DEV=https://api.formamorph.ai/api

RUN npm run build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.source="https://github.com/vibecoder9527/formamorph" \
      org.opencontainers.image.title="Formamorph" \
      org.opencontainers.image.description="Formamorph web app with a Traditional Chinese (Taiwan) interface"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
