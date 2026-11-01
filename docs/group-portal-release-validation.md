# Validação para produção — Portal do Grupo

Data: 10/10/2026. Resultado: **NÃO LIBERAR a versão atual para produção**.

Escopo: código local do Portal do Grupo / multiempresa, incluindo alterações não commitadas provenientes da revisão anterior. O módulo Delivery mencionado no início da conversa não existe nesta cópia; não foi objeto desta validação. Não houve deploy, alteração em banco de produção ou envio de mensagens.

## Evidências executadas

| Verificação | Resultado |
|---|---|
| Build NestJS | Passou |
| Typecheck e build Vite | Passaram; permanece alerta de bundle grande |
| Jest `groups.service.spec.ts` | 18 testes passaram |
| Navegação Edge/Chromium, larguras 360, 375, 390, 412, 420, 768 e 1440 | Passou nas sete larguras, sem overflow horizontal ou `pageerror` |
| Serviço real com Prisma e dois bancos MySQL locais isolados | 11 cenários passaram |
| Sondas adicionais de liberação em MySQL | 3 problemas reproduzidos; liberação reprovada |
| `git diff --check` | Passou |

Os 11 cenários de integração e os bloqueios estão em `group-portal-mysql-results.json`. O script retorna código diferente de zero quando encontra bloqueios, mesmo com os cenários básicos passando.

Interface: dashboard, períodos e indicadores, detalhe de loja, previsão de compras sem histórico, busca e filtro de estoque, ajuste fracionado com saldo original, sincronização com falha por loja, edição de preço apenas na filial selecionada, cadastro de produto com custo zero e filial selecionada, validação de quantidade, falha/sucesso de transferência, histórico, menus e fechamento de modais. As chamadas HTTP desses testes são simuladas; os testes MySQL verificam o serviço separadamente.

Inspecionadas também capturas de dashboard, estoque, cadastro e transferências em 360 px. O formulário longo usa rolagem dentro do modal; o teste alcançou e acionou o botão de cadastro. Isso não substitui teste com teclado virtual e Safari em aparelho físico.

## Correções realizadas nesta validação

1. **Entrada de estoque:** incremento atômico, lote e histórico na mesma transação; validação de quantidade e custo; custo zero preservado; invalidação do cache. Testes reais comprovaram que cinco entradas concorrentes não perdem saldo e falha no histórico desfaz saldo e lote.
2. **Ajuste de estoque:** a tela envia `expectedStock`; o serviço recusa salvar se o saldo mudou desde a abertura. Protege contra sobrescrever uma venda/transferência ocorrida durante a edição. O campo é opcional por compatibilidade; chamadas antigas sem ele não têm essa proteção contra formulário desatualizado.
3. **Cadastro selecionado:** cadastrar EAN já existente passa a retornar erro por filial, sem alterar silenciosamente unidade, custo e preço. Não se alterou o endpoint legado de criação para todas as lojas.
4. **Sincronização:** se o produto já existir no destino, retorna erro e pede atualização do catálogo, preservando preços, unidade e status locais. Não é mais usado `upsert` para sobrescrever o produto existente nessa operação.

## Bloqueios reproduzidos

### 1. Transferência pode ser duplicada após perda da resposta — prioridade alta

Arquivo: `backend/src/groups/groups.service.ts`, `stockTransfer`, geração de `transferId`; tela: `frontend/src/pages/group-portal/Transfers.tsx`.

Prova: duas chamadas com o mesmo corpo e o mesmo `requestId` geraram recibos diferentes e dois débitos de 0,1. O backend ignora esse identificador e cria novo UUID por chamada. A tela permite repetir após erro de rede. Saldo suficiente permite duplicar a movimentação mesmo com proteção contra estoque negativo.

Critério para liberar: identificador durável por operação, verificação de conteúdo ao repetir, retorno do resultado já confirmado sem novo débito, tratamento de chamadas simultâneas e persistência da tentativa no navegador para sobreviver a recarga/perda de resposta. Testar queda após cada commit e retomada após reinício. Hoje não há recuperação automática do intervalo entre commits nos dois bancos; operações podem ficar pendentes de conferência.

### 2. Transferência muda a valorização dos lotes — prioridade alta

Arquivo: `backend/src/groups/groups.service.ts`, criação de `stockLot` no destino em `stockTransfer`.

Prova: os lotes de origem tinham custo zero, mas o lote recebido foi criado com custo 4, vindo do custo padrão do cadastro. O FIFO é consumido na origem, porém o custo desses lotes não é transportado.

Critério para liberar: preservar custo e quantidade dos lotes consumidos, com regra explícita para saldo legado sem lote. Cobrir múltiplos lotes com custos distintos, quantidade fracionada e compensação. Não basta comparar a soma das quantidades.

### 3. Sincronização perde comportamento do produto — prioridade alta

Arquivo: `backend/src/groups/groups.service.ts`, `syncProductsToTenants`.

Prova: produto com `isComposite=true` e `requiresKitchen=true` foi copiado com os dois campos falsos. A loja destino passa a vender um produto com comportamento diferente, sem composição nem envio à cozinha.

Critério para liberar: copiar configurações operacionais e mapear relações locais (componentes, modificadores e regras fiscais) ou impedir explicitamente a sincronização dos cadastros não suportados. Nunca tratar como sucesso uma cópia funcionalmente incompleta.

## Outros pontos da revisão e limites

- Cadastro sem EAN não tem chave única por nome/unidade. A checagem e criação são separadas; cadastro simultâneo requer proteção adicional contra duplicação. Esse cenário não foi medido nesta rodada.
- Endpoints legados de criação e atualização para todas as lojas continuam com regras diferentes dos endpoints usados pela tela; devem ser unificados ou descontinuados antes de afirmar proteção uniforme da API.
- A confirmação negativa de recibo após erro de comunicação entre bancos precisa distinguir falha com rollback confirmado de resultado desconhecido, evitando compensação prematura.
- A previsão de compras ainda ignora falhas de leitura de filiais; o usuário pode receber um consolidado parcial sem indicação adequada. Revisado em código, não simulado em MySQL nesta rodada.
- O build frontend tem chunk principal de aproximadamente 2,53 MB (684 KB gzip). Não houve medição de carregamento em 4G ou aparelho de baixo desempenho.
- Os testes reais usam `GroupsService` e Prisma sem mocks de persistência. Apenas grupo/filiação e invalidação do cache são fixtures; não validam login, expiração de JWT, middleware, proxy, migrações de produção ou integração HTTP completa.
- Os dois bancos `portal_qa_<timestamp>_a/b` foram criados no MySQL Docker local (porta 3308) e removidos ao final. Nenhuma conta real foi alterada.
- Não foi executada regressão de todos os demais módulos do PDV. A liberação aqui avaliada é a deste portal.

## Reproduzir

```powershell
Set-Location backend
npm run build
npm test -- --runInBand groups.service.spec.ts
Set-Location ..
node scripts/group-portal-mysql.cjs
```

O script MySQL exige o container local `7bar_backend` e valida o host antes de criar bases isoladas. Não imprime credenciais. Código não zero e `releaseReady: false` indicam bloqueios, não aprovação.

Para interface, iniciar o frontend na porta 4173 e executar `scripts/group-portal-responsive.cjs` com `PLAYWRIGHT_MODULE` apontando para uma instalação Playwright. Por padrão usa Edge e grava capturas/`report.json` em `%TEMP%/pdv-group-portal-qa`; `PORTAL_QA_OUTPUT` permite outro diretório.
