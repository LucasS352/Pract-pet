# Portal Grupo — revisão de 09/10/2026

O Sys-Init continua montando grupos por `TenantGroupMember`. O portal `/grupo-portal` consulta exclusivamente os tenants vinculados ao grupo do usuário autenticado. As alterações são locais, sem deploy nem migração de banco.

## Interface

- Abaixo de 768 px: menu inferior com cinco abas, cabeçalho com gestor, estado de conectividade do navegador, período Hoje/7D/30D e gaveta de conta. Padding de 16 px e áreas seguras.
- Desktop: sidebar de 220 px, recolhível a 76 px. KPIs em duas colunas nas telas menores e quatro nas maiores.
- Detalhes da loja: drawer lateral no desktop e sheet de 90dvh no celular. Diálogos nativos mantêm foco, fecham com Escape e restauram foco ao controle anterior.
- Compras: cards expansíveis no celular; ação abre estoque filtrado pelo produto. Sem vendas: autonomia `null`, exibida como “Sem histórico”, sugestão zero.
- Estoque: visualização adaptativa, com seleção explícita de cards/tabela, busca com debounce de 180 ms, filtro por loja e saldo. Ajustes em modal.
- Produtos: edição de preços em modal por filiais selecionadas; equalização opcional. Criação por loja e resultados individuais. A sincronização exibe lojas atualizadas ou erros reais.
- Transferências: origem, destino, busca, produto/saldo e quantidade. Histórico persistente das últimas cinco operações, incluindo pendências e cancelamentos.

## Regras de negócio

- Dashboard retorna `countToday` e `countPeriod` distintos. Ticket médio usa `salesMonth / countPeriod`, ambos do período selecionado, com proteção contra divisão por zero. O nome legado `salesMonth` continua significando total do período solicitado.
- Intervalos rápidos cobrem o dia atual e os 6/29 dias anteriores, desde meia-noite; timestamps de término não são ampliados pelo backend. Agrupamento diário usa a data local do servidor, cujo deploy configura `TZ=America/Sao_Paulo`.
- Previsão consolida nome normalizado + unidade entre IDs locais diferentes, excluindo vendas canceladas e ajustes fiscais.
- Prisma agora é tipado em `GroupsService`. Corrigido `inventoryLog.notes` para o campo real `reason`; upsert de produtos resolve o ID, pois `name` não é uma chave única no schema.
- Ajuste de estoque atualiza saldo, lotes e log em uma transação local, com verificação de concorrência.
- Atualização de preços só informa sucesso se ao menos um produto foi alterado, valida valores e invalida cache da loja.

## Transferências entre bancos separados

1. Valida quantidade positiva, até três casas decimais, lojas distintas e pertencimento ao grupo.
2. Antes de qualquer débito, exige destino ativo e inequívoco, usando EAN ou nome + unidade. Produto ausente/incompatível bloqueia a operação com orientação para sincronizar o catálogo.
3. Origem: débito condicional, consumo FIFO e `transfer_out` na mesma transação. Mantém o saldo que existe fora de lotes; não recalcula o estoque somente pela soma dos lotes.
4. Destino: incremento, novo lote e `transfer_in` na mesma transação. Logs compartilham UUID em `id/referenceId`, com contraparte em `referenceKey` e origem `GROUP_TRANSFER`.
5. Se o destino falha, consulta o recibo antes de compensar. Sem recibo, restaura saldo/lotes de origem e marca `transfer_cancelled`. Recibo confirmado após perda de resposta é tratado como sucesso.
6. Se não for possível confirmar o destino ou compensar, retorna a referência e preserva a pendência para conferência. Não existe transação distribuída nem recuperação automática após interrupção do processo entre as duas confirmações. O histórico compara a saída com o recibo de entrada e distingue `completed`, `pending` e `cancelled`.

Novo endpoint: `GET /api/groups/my/stock-transfers`, protegido por JWT e `groupId`. Retorna `transfers` e `unavailableTenants` para sinalizar histórico parcial. O histórico rastreável se aplica às operações registradas com `origin=GROUP_TRANSFER` por esta versão.

## Validação local

- Frontend: `npm run build` (inclui `tsc --noEmit`).
- Backend: `npm run build`.
- Backend: `npm test -- --runInBand groups.service.spec.ts` — 18 testes cobrindo quantidades inválidas, isolamento de grupo, destino ausente, concorrência no débito, ausência de lotes, falhas nos logs, compensação, perda da confirmação, previsão sem vendas e contrato de período do dashboard.
- Navegador Edge/Chromium headless: `scripts/group-portal-responsive.cjs`, com Playwright disponível pelo módulo `playwright` ou variável `PLAYWRIGHT_MODULE`. Frontend local em `http://127.0.0.1:4173/grupo-portal` (substituível por `PORTAL_URL`).
- Viewports 360, 375, 390, 412, 420, 768 e 1440 px: cinco abas, ausência de overflow horizontal, navegação ativa, fechamento de sheets, filtros, preços somente nas filiais escolhidas, falha de sync, erro HTTP de transferência e histórico após sucesso.
- Capturas e relatório em `%TEMP%/pdv-group-portal-qa` (substituível por `PORTAL_QA_OUTPUT`).
- APIs simuladas nos testes de interface e clientes Prisma simulados nos testes de serviço. Não houve movimentação em bancos reais nem teste em aparelho físico. Os builds mantêm avisos de bundle/importação do `xlsx`, sem erros de tipagem.

Homologação integrada entre dois bancos de teste e publicação continuam sendo etapas operacionais posteriores; cenários de indisponibilidade persistente exigem conferência pelos IDs dos logs.
