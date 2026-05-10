FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npx tsc

# --- runtime stage ---
FROM node:20-alpine

RUN apk add --no-cache lsof procps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY README.md LICENSE ./

ENTRYPOINT ["node", "dist/cli.js"]
