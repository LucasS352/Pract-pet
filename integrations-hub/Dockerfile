FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/heart.schema.prisma

RUN npm run build

# ---- Production ----
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/dist ./dist

# Não precisa expor porta HTTP pois é apenas background worker,
# Mas o NestJS sobe uma porta padrão. Se expor, usar diferente.
ENV PORT=3530

CMD ["node", "dist/main"]
