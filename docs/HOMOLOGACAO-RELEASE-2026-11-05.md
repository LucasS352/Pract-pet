# Homologação da versão Pract Pet

Data: 5 de novembro de 2026. Destino planejado: VPS 2.25.136.55 e domínio praticpet.teltech.com.br.

## Resultado dos testes

- Backend no Windows: 318 testes aprovados em 49 suítes.
- Backend dentro da imagem Linux com instalação limpa e lock atualizado: 318 testes aprovados em 49 suítes, sem acesso à rede durante os testes.
- Frontend: 36 testes aprovados; o teste opcional do Nginx foi executado à parte. Nessa execução, os 7 testes de rede passaram, incluindo Nginx real.
- Inicialização segura: 3 testes aprovados; reiniciar o backend não altera schemas do Heart ou de clientes.
- Builds Docker de frontend e backend concluídos. Dependências instaladas com npm ci. Prisma 6.19.3 disponível na imagem final para provisionamento explícito.
- Navegador: Hoje, Agenda, Pacotes e Comissões verificados em 375, 430, 768, 1024, 1440 e 1920 px, sem overflow de página ou erro JavaScript observado.
- Perfil operacional: PIN, duas abas e restrições administrativas validados.
- Portal anônimo: álbum, ampliação e download aprovados em 375, 430 e 1440 px. Imagens lazy foram carregadas antes da conferência.
- CSV: tutor, rastreabilidade e ajustes confirmados na exportação.
- Recebimento: pagamento dentro da Agenda com PIN da Beatriz, autoria da venda, conclusão, bloqueio de duplicidade e rolagem liberada após fechar. PDV desativado bloqueia acesso direto e checkout externo.
- Pacotes, precisão decimal, precedência de regras de comissão, concorrência de checkout e pagamentos divididos cobertos pelas suítes automatizadas. Fluxos integrados de pacote puro e misto foram exercitados no tenant local durante a homologação.

## Dependências

Foram aplicadas atualizações compatíveis do lockfile. A vulnerabilidade crítica identificada em proxy-addr foi corrigida para 2.0.8. A auditoria após as correções ainda apontou 71 alertas no conjunto de dependências de desenvolvimento e produção, incluindo 38 de severidade alta. Não foi usado audit fix --force: correções que exigem mudanças incompatíveis precisam de avaliação própria. Estes testes funcionais não representam auditoria completa de segurança nem certificação para dados sensíveis.

## Stack de produção

Arquivo: docker-compose.production.yml. Variáveis documentadas em .env.production.example. Frontend 3531, API 3530 em loopback, NFC-e 3532 em loopback e MySQL apenas na rede interna. Nomes de contêineres, rede e volumes dedicados a practpet. As portas do VPS ainda precisam ser conferidas antes de publicar, para preservar o PDV existente.

PUBLIC_APP_URL deve corresponder ao endereço acessível pelos tutores: inicialmente http://2.25.136.55:3531; após DNS e TLS, https://praticpet.teltech.com.br. Consulte PRODUCAO.md para inicializar um Heart novo ou atualizar schemas de clientes existentes com backup e sem aceitar perda de dados.

## Limites e dados de homologação

As verificações mobile usaram emulação de viewport no navegador. Permanecem para validação no ambiente real: aparelho físico, câmera, permissões de download, HTTPS, DNS, firewall, comportamento da rede e integrações externas. Não houve emissão fiscal nem transação bancária real. PIX e cartões no modal são registros manuais de recebimento.

Dados QA, vendas fictícias, fotos, capturas, relatórios privados e backups ficam apenas no ambiente local e não acompanham o Git. Não copie o banco de homologação para uma instalação nova de cliente.

## Publicação remota

A preparação e os testes locais foram concluídos. A publicação no VPS não foi executada nesta etapa: o SSH recusou a chave disponível e o controle do navegador não conseguiu validar a URL da janela de administração. É necessário disponibilizar acesso autenticado ao servidor ou Portainer antes de criar a stack e conferir as portas ocupadas.
