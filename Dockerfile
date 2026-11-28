# 잔불의 대지 서버 (게임 파일 + 계정/세이브 API). 데이터는 /data (영구 볼륨을 붙일 것)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
EXPOSE 8080
CMD ["node", "server/index.mjs"]
