# 7Bar PDV — Sistema de Ponto de Venda

Sistema SaaS de PDV (Ponto de Venda) multi-tenant com backend NestJS e frontend Next.js.

## 🚀 Deploy via Portainer (Produção)

### Pré-requisitos no servidor
- Docker + Docker Compose instalados
- Portainer rodando: `http://179.127.59.225:9000`

### 📦 Portas utilizadas
| Serviço     | Porta |
|-------------|-------|
| Backend API | 3520  |
| Frontend    | 3521  |
| MySQL       | 3307  |

### 🔧 Passo a passo no Portainer

1. Acesse o Portainer: `http://179.127.59.225:9000`
2. Vá em **Stacks → Add Stack**
3. Dê o nome: `7bar`
4. Selecione **Repository** como método de build
5. Informe a URL do repositório Git
6. Path do compose: `docker-compose.yml`
7. Em **Environment variables**, adicione:
   ```
   MYSQL_ROOT_PASSWORD=7bar@2025
   JWT_SECRET=7bar_jwt_super_secret_2025
   SERVER_IP=179.127.59.225
   ```
8. Clique em **Deploy the stack**

### 🌐 Acesso após deploy
- **Frontend**: http://179.127.59.225:3521
- **Backend API**: http://179.127.59.225:3520

---

## 💻 Desenvolvimento Local

### Backend
```bash
cd backend
cp .env.example .env  # edite com suas configs locais
npm install
npm run start:dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Banco de dados local (Docker)
```bash
docker run -d --name mysql_local \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=7bar \
  -p 3307:3306 \
  mysql:8.0
```
