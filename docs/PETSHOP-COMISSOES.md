# Comissões do Pet Shop

## Ativação

1. Atualize o schema de cada tenant pelo fluxo existente de migração em **Sys Init** (`POST /tenants/migrate`). O novo módulo usa as tabelas `pet_commission_rules`, `pet_commissions`, `pet_commission_closings` e `pet_commission_adjustments`.
2. Em **Serviços → Etapas da loja**, marque **Rastrear profissional responsável** nas etapas executáveis. Isso cria uma regra geral `NONE`, que registra produtividade sem pagar comissão.
3. Em **Equipe → Comissões**, configure regras para a etapa, serviço e profissional. A ordem é: serviço+profissional, profissional, serviço, etapa geral.

## Cálculo

- Cada transição confirmada de uma etapa rastreada usa o PIN da sessão `petshop` e grava um lançamento por item executado. A restrição única `(appointmentServiceId, stageKey)` e a trava do atendimento impedem duplicidade.
- Valores são calculados com `Prisma.Decimal`, com arredondamento `ROUND_HALF_UP` para centavos. Regras são versionadas; os lançamentos guardam a base, tipo, valor e versão aplicados.
- Serviço avulso usa o preço comercial congelado no agendamento. Combo distribui o preço do item pai proporcionalmente aos valores individuais congelados dos componentes. O último componente recebe o resíduo de centavos. O item pai não gera comissão separada.
- Sessão de pacote usa o valor por sessão salvo no contrato mesmo quando a comanda diária cobra zero. Sessões não consumidas não usam base contratual.
- Etapas ignoradas não geram lançamento. Cancelamento ou falta estorna os lançamentos do atendimento em transação. Pagamentos já realizados geram ajuste negativo pendente no mês do estorno.

## Fechamento

- Períodos seguem o fuso `America/Sao_Paulo` e só podem ser fechados após terminar o mês.
- Aprovação e pagamento são operações distintas. A transição de pagamento é condicional ao estado `APPROVED` e rejeita pendências, incluindo ajustes. O fechamento preserva os valores aprovados e pagos como instantâneos.
- Correções são ajustes auditáveis com justificativa e entram no mês em que foram registradas. Ajustes posteriores a um fechamento pago entram no fechamento mensal seguinte.
- Apenas contas `admin` e `superadmin` acessam as rotas financeiras. O banco separado por tenant e o `tenantId` do lançamento preservam a origem.

## Verificação local

`npx prisma generate --schema=prisma/schema.prisma`, `npm run build` no backend, `npm run typecheck` no frontend e os testes Jest de serviços, pacotes e comissões. Não há migração de dados de produção nem teste de integração MySQL automático neste documento.
