# Garçom mobile e carga de inauguração — 16/09/2026

## Escopo e ambiente

Teste autorizado pelo usuário na conexão House (`localhost:3308`), banco `rei_adegas`.
House é o nome da conexão, não um segundo tenant. API e MySQL reais em Docker local.
Docker dispõe de 8 CPUs e aproximadamente 7,74 GiB de RAM, compartilhados com outros serviços.
O gerador HTTP roda no mesmo container do backend; medições de CPU/memória desse container incluem o gerador. A carga usa a API diretamente, sem Nginx nem rede externa.
Hardware/limites da produção ainda não informados: os resultados locais não certificam a capacidade do servidor de produção nem do Wi-Fi do estabelecimento.

As fixtures criam categoria, três produtos simples (cozinha/bar/serviço), operadores, caixas e comandas identificados por `LOAD-*`/`RACE-*`.
Produtos existentes não são usados. Emissão fiscal desligada nos pedidos; ausência de integrações do tenant verificada antes da preparação.
Nenhum schema ou banco de produção foi alterado. Os registros de teste ficam no banco autorizado para auditoria; não há limpeza destrutiva automática.

## Correções

- `/garcom`: `touch-action: pan-x pan-y` na página e portais, permitindo rolagem e impedindo gestos de zoom; classe removida ao sair da página. Campos usam fonte mínima de 16 px com ponteiro coarse para evitar zoom de foco em celular.
- Checkout: teste real reproduziu `P2034` (deadlock/conflito de escrita) com dois caixas. Repete somente transações confirmadamente abortadas pelo Prisma, até quatro tentativas com espera incremental e variação aleatória. Não repete automaticamente timeout ou falha de conexão de resultado incerto.
- Lançamento de itens: teste real reproduziu erros concorrentes na mesma comanda. O lançamento agora bloqueia a linha da comanda antes de ler produtos/mudar estoque, revalida o estado dentro da transação e usa `ReadCommitted`, além de retry de `P2034`.
- Numeração de vendas: a auditoria de 300 comandas detectou códigos amigáveis repetidos em vendas distintas. Checkouts passam a bloquear a linha singleton de configurações antes da primeira leitura da transação, serializando a geração `MAX(code)+1` por tenant inclusive entre processos. O bloqueio dura até commit/rollback; cria a linha com defaults apenas se ausente e não sobrescreve configurações. Não renumera vendas antigas.
- Sem mudança em schema. Publicação exige backend e frontend; não exige Atualizar Bancos por estas alterações.

## Evidências iniciais

- Build frontend aprovado (avisos anteriores de tamanho de bundle e importação XLSX).
- Build backend aprovado.
- 41 testes Jest aprovados: KDS, lançamentos/remoções, resiliência/entrega de vendas e retry.
- Fluxos automatizados desktop/mobile com API simulada passaram. CSS calculado conferido em `/garcom` e no modal via portal. Isso não substitui toque físico em Android/iOS.
- Antes: smoke com 8 comandas falhou no checkout; corrida de três lançamentos na mesma comanda retornou `500,500,201`.
- Depois: 8/8 comandas concluídas, sem erro HTTP, estoque final conferido.
- Depois: 10 rodadas de três lançamentos simultâneos na mesma comanda e de dois caixas fechando a mesma comanda passaram. Cada fechamento produziu uma venda e uma recusa de negócio, sem dupla cobrança.
- Relatórios sem tokens/dados pessoais em `docs/event-load-validation/`.
- A primeira rodada de 300 completou o fluxo/estoque, mas falhou na auditoria adicional de códigos de vendas (47 grupos repetidos observados durante a rodada). `load-300-before-sequence-fix.json` contém `passed: true` do runner anterior, que ainda não verificava códigos: **não representa aprovação integral**. O runner atual verifica também a unicidade dos códigos recebidos.

## Cenário de carga

`backend/scripts/event-load.mjs` usa Node 20+ e HTTP real, sem dependências adicionais:

1. Valida tenant de cada sessão, KDS, produtos e caixas abertos.
2. Prepara 300 comandas, como cenário conservador de uma comanda por pessoa.
3. Simula 4 garçons, 2 caixas e 1 cozinha; cada pedido tem três itens, totalizando 900 itens.
4. Consulta KDS a cada 5 segundos e comandas a cada 15 segundos. Consulta catálogo ao lançar, como a tela atual.
5. Avança cozinha/bar por etapas; garçons confirmam entrega e solicitam pagamento.
6. Caixas fecham comandas e repetem a mesma requisição com a mesma chave, conferindo idempotência.
7. Confere itens/quantidades, valores, estado de entrega, fechamento e estoque final dos produtos exclusivos.
8. Grava percentis, erros, bytes e resultado em JSON. Falha se houver inconsistência, HTTP inesperado, prazo excedido ou p95 acima de 2 s.

Os tempos incluem preparo/preflight. O script mede tempo completo da resposta HTTP e usa carga fechada: quando o servidor fica lento, a geração também desacelera. Não mede capacidade máxima de requisições por segundo.
Cozinha é acelerada (etapas de 5 s) e entregas podem ser agrupadas. O modo `backlog` prepara os 900 itens antes de iniciar os leitores, para medir uma fila cheia.
Não inclui produtos compostos no teste de carga, emissão SEFAZ, TEF, impressoras, internet/Wi-Fi, perda de conectividade ou outros tenants recebendo carga simultânea.

## Reproduzir no ambiente local autorizado

O helper `event-load-local.cjs` é específico do Docker local e `rei_adegas`. Confere host `mysql`, exige flag explícita e ausência de integrações, prepara dados exclusivos e gera sessões de teste usando o segredo interno sem imprimi-lo ou salvar tokens nos relatórios.
Ele não deve ser executado em produção. Para outra homologação, use o runner genérico com configuração e sessões próprias.

Copiar scripts ao container local:

```powershell
docker cp backend/scripts/event-load.mjs 7bar_backend:/tmp/event-load.mjs
docker cp backend/scripts/event-concurrency.mjs 7bar_backend:/tmp/event-concurrency.mjs
docker cp backend/scripts/event-load-local.cjs 7bar_backend:/tmp/event-load-local.cjs
```

Rodada pequena, carga, corrida e fila cheia:

```powershell
docker exec -e LOAD_LOCAL_REI_ADEGAS=yes -e LOAD_ORDERS=8 -e LOAD_ACTION_MS=300 7bar_backend node /tmp/event-load-local.cjs
docker exec -e LOAD_LOCAL_REI_ADEGAS=yes -e LOAD_ORDERS=300 -e LOAD_ACTION_MS=1000 7bar_backend node /tmp/event-load-local.cjs
docker exec -e LOAD_LOCAL_REI_ADEGAS=yes -e LOAD_PROBE=yes 7bar_backend node /tmp/event-load-local.cjs
docker exec -e LOAD_LOCAL_REI_ADEGAS=yes -e LOAD_ORDERS=300 -e LOAD_SCALE=2 -e LOAD_BACKLOG=yes -e LOAD_ACTION_MS=500 7bar_backend node /tmp/event-load-local.cjs
```

As variáveis alteram a carga; `LOAD_SCALE=2` representa 8 garçons, 4 caixas e 1 cozinha.
O runner imprime o caminho de seu JSON em `/tmp` para cópia com `docker cp`.
A prova de concorrência verifica integridade; suas recusas esperadas não são falhas de carga.

## Antes da inauguração

Repetir em homologação com recursos equivalentes aos de produção e realizar ensaio nos aparelhos/rede do local: lançamento, cozinha, retirada, pagamento e reconexão. Conferir totais e estoque, além do tempo de resposta. O sucesso local é evidência limitada ao cenário medido.
