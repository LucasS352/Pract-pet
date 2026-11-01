FROM node:20-alpine AS builder

WORKDIR /app

# Dependências nativas para bcrypt e Prisma
RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
RUN npm ci

COPY . .

# Gera ambos os Prisma Clients antes do build (com binários Linux embutidos via binaryTargets)
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/heart.schema.prisma

RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# ---- Production ----
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl mysql-client

COPY package*.json ./
RUN npm ci --omit=dev

# Prisma Client padrão (tenant) — binário Linux gerado no builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Heart-client — gerado em src/generated pelo builder (binário Linux)
COPY --from=builder /app/src/generated ./src/generated

# Código compilado
COPY --from=builder /app/dist ./dist

# Apenas os arquivos .prisma (schemas) — NÃO copiar prisma/generated (binários Windows!)
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/heart.schema.prisma ./prisma/heart.schema.prisma

COPY entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

EXPOSE 3530

ENTRYPOINT ["./entrypoint.sh"]
