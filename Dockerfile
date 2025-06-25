# Build stage
FROM --platform=$TARGETPLATFORM ghcr.io/puppeteer/puppeteer:24 AS builder
WORKDIR /app

USER root
RUN apt-get update && \
    apt-get install -y \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev

RUN npm install -g aws-lambda-ric

# 複製 package 相關檔案
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# 安裝所有依賴並編譯 TypeScript
RUN npm install
RUN npm run build

# Production stage
FROM --platform=$TARGETPLATFORM ghcr.io/puppeteer/puppeteer:24 as production
WORKDIR /app

# 從 builder 階段複製編譯後的文件和 package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /usr/local/lib/node_modules/aws-lambda-ric /usr/local/lib/node_modules/aws-lambda-ric

# 建立 puppeteer 的 cache 目錄
USER root
RUN mkdir -p /app/dist/function/.cache/puppeteer
ENV PUPPETEER_CACHE_DIR=/app/dist/function/.cache/puppeteer
RUN chown -R pptruser:pptruser /app

# 設置正確的權限
USER pptruser

# 安裝 Chrome
RUN npx puppeteer browsers install chrome

# 清理 npm cache
RUN npm cache clean --force

# 明確設定 entrypoint
ENTRYPOINT ["node"]
CMD ["dist/bin/cli.js"]
