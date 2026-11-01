FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_APP_MODE
ENV VITE_APP_MODE=$VITE_APP_MODE

RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# ---- Production stage (Nginx) ----
# Nginx com proxy /api/ → backend para que imagens e uploads funcionem
FROM nginx:alpine AS production

# Remove config padrão do nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia nossa configuração com proxy para o backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia o build do Vite
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3531

CMD ["nginx", "-g", "daemon off;"]
