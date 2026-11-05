# Pract Pet

Gestão de pet shops com agenda, tutores e pets, etapas com fotos, portal do tutor, pacotes, comissões e recebimento dentro do Pet Shop. O PDV é opcional por cliente. Frontend React com Vite; backend NestJS e MySQL.

## Ambiente local

Use `docker compose up -d --build`. Frontend em http://localhost:3531 e API em http://localhost:3530/api. MySQL local na porta 3309. As variáveis locais ficam no `.env`, fora do Git.

## Produção

Consulte [o procedimento de publicação](docs/PRODUCAO.md). A stack dedicada está em `docker-compose.production.yml`. Ela utiliza volumes `practpet_mysql_data` e `practpet_uploads_data`, que devem ser preservados nas atualizações.

## Testes

Backend: `cd backend && npm ci && npm test -- --runInBand`.
Frontend: `cd frontend && npm ci && npm run build && node --test tests/*.test.cjs`.

As rotinas locais de homologação que gravam dados fictícios devem ser usadas exclusivamente em ambiente de teste. Elas, as evidências e os backups locais não são publicados no Git.
