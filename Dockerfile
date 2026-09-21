FROM node:22-alpine AS base
WORKDIR /usr/src/wpp-server

# Install Chromium and required system libs
RUN apk update && \
    apk add --no-cache \
    chromium \
    chromium-chromedriver \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips \
    vips-dev \
    fftw-dev \
    gcc \
    g++ \
    make \
    libc6-compat \
    pkgconfig \
    python3 \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer/WPPConnect to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# Yarn 4 node-modules linker
COPY .yarnrc.yml ./

COPY package.json yarn.lock ./

RUN corepack enable && \
    corepack prepare yarn@4.13.0 --activate

RUN yarn install --immutable

FROM base AS build
WORKDIR /usr/src/wpp-server
COPY . .
RUN yarn install
RUN yarn build

FROM build AS runtime
WORKDIR /usr/src/wpp-server/

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Render assigns PORT env var dynamically
EXPOSE 21465

ENTRYPOINT ["node", "dist/server.js"]
