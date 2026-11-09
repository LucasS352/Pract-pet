# Publicação do Pract Pet

VPS confirmado: 2.25.136.55 (Ubuntu 24.04). Domínio planejado: praticpet.teltech.com.br. O Portainer e o PDV existente compartilham o servidor; confira as portas antes de iniciar.

## Stack dedicada

Repositório: https://github.com/LucasS352/Pract-pet.git. Branch main. No Portainer com Docker Compose, use o arquivo docker-compose.production.yml e o nome practpet. A stack usa build local; Docker Swarm exige imagens previamente publicadas em um registry e um arquivo próprio, sem build.

Copie .env.production.example para .env no servidor ou cadastre as variáveis no Portainer. Defina uma senha MySQL, suas versões codificadas nas URLs DATABASE_URL_HEART e DATABASE_URL_TENANT, JWT_SECRET e os PINs administrativos. A senha MySQL deve coincidir nas conexões. Não use os valores de exemplo em produção.

O frontend publica 3531. API 3530 e NFC-e 3532 ficam em loopback; o MySQL fica apenas na rede Docker. Configure um proxy HTTPS apontando para o frontend 3531: ele já encaminha /api ao backend. O domínio acessado pelo celular deve ser o mesmo usado para gerar links do portal. localhost não funciona em outro aparelho. Defina PUBLIC_APP_URL=http://2.25.136.55:3531 enquanto usar o IP; após apontar DNS e configurar TLS, altere para https://praticpet.teltech.com.br. Essa variável também forma os links das automações WhatsApp.

## Instalação nova

1. Configure as variáveis e execute docker compose -f docker-compose.production.yml config --quiet.
2. Execute docker compose -f docker-compose.production.yml build e depois up -d mysql.
3. Execute docker compose -f docker-compose.production.yml up -d. O backend cria o banco e o schema Heart somente se ele não tiver tabelas, inclusive quando o volume MySQL já existia. Se a inicialização falhar, o backend não inicia a API; verifique os logs.
4. O bootstrap pode ser desativado com `BOOTSTRAP_EMPTY_HEART=false` quando a infraestrutura gerencia o Heart separadamente.
5. Aguarde MySQL saudável e API inicializada; confira docker compose -f docker-compose.production.yml ps e logs --tail 100 backend.
6. Acesse /sys-init com o PIN administrativo configurado e crie o estabelecimento e seu administrador. O provisionamento cria o banco do cliente com o schema atual.
7. Configure os módulos do cliente; para usar somente Pet Shop, desative PDV Caixa.
8. Cadastre equipe com PINs individuais, serviços, tutores, pets e regras de comissões. Configure automações WhatsApp conforme a operação real.

### Portainer com volume MySQL já existente

O Docker executa `mysql/init.sql` somente ao criar um volume MySQL vazio. Se o volume já existia, a API pode falhar com `Database heart_practpet does not exist`; o frontend então retorna HTTP 502, mesmo para rotas sem PIN. A imagem atual do backend detecta um Heart ausente ou sem tabelas, cria o banco e aplica o schema inicial antes de iniciar a API. Bancos Heart com tabelas são preservados; para instalações com dados, revise o schema e faça backup antes de qualquer migração. Não remova o volume MySQL. No Portainer, use **Pull and redeploy** com rebuild da imagem do backend; apenas reiniciar um contêiner antigo não instala o bootstrap.

Antes de informar o PIN, `GET /api/tenants/setup/list` deve retornar HTTP 401. HTTP 502 indica que o proxy ainda não alcança a API e não confirma um PIN incorreto.

## Atualização de instalação existente

Faça backup do Heart e de cada banco de cliente e preserve os volumes antes de atualizar. Não execute down -v. Atualize código e imagens. O startup não atualiza automaticamente schemas dos clientes.

Esta versão adiciona tabelas e campos para pacotes e comissões. Antes de atender clientes existentes, confira o diff do schema e aplique o schema atual explicitamente ao banco selecionado usando Prisma 6 incluído na imagem: prisma db push --schema=prisma/schema.prisma --skip-generate, com DATABASE_URL_TENANT apontando para aquele banco. Não use --accept-data-loss. Se o Prisma solicitar exclusão de dados, interrompa para revisar. Use heart.schema.prisma apenas no Heart, nunca nos bancos de clientes.

## Conferência após publicar

No computador e celular, confira login/PIN, agenda, check-in, foto, portal do tutor, pacote puro, pacote com extra e recebimento dividido. Confirme autoria do colaborador e bloqueio de segunda cobrança. Verifique Gerado = Pendente + Aprovado + Pago, além da exportação CSV. PIX e cartões no modal são registros manuais; não são integração bancária automática.

Use dados de teste identificados. Nenhum dado QA, foto, banco ou credencial local acompanha o Git. Os testes locais não substituem validação de HTTPS, domínio, permissões de câmera/download e rede no aparelho real.
