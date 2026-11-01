# Resiliência de vendas — correções locais de 08/09/2026

## Estado da entrega

Código corrigido com autorização de Lucas. Sem commit, push, deploy, reinício de containers ou alterações nos bancos. A versão executada nos containers NÃO foi atualizada por esta tarefa.

## Correções

- Falha na gravação inicial do IndexedDB não dispara POST, não limpa o carrinho e não anuncia contingência salva.
- Snapshot e identidade preservados antes do envio. Reenvio usa a mesma operação; recusas/conflitos são mantidos em REVIEW sem reenvio automático.
- Sale.requestFingerprint é persistido na transação da venda. Sem cache de arquivo nem comparação reduzida ao total. Venda antiga sem fingerprint exige revisão; arquivos antigos não são apagados nem usados para inventar uma identidade retroativa.
- SaleDeliveryJob registra as intenções de entrega na mesma transação. Worker com claim atômico recupera estoque absoluto. Resultado fiscal desconhecido exige consulta/conferência no Gestor Fiscal; não há promessa de exactly-once de serviços externos.
- Rascunho por loja/operador/aba restaurável no F5. Operações já submetidas são recuperadas pelo IndexedDB, inclusive SYNCING. Web Locks evitam disputar uma requisição ainda ativa em outra aba; navegador sem suporte falha explicitamente.
- Fila filtrada por loja/operador, com releitura dentro do lock e verificação da identidade no interceptor antes do envio. Retomada sequencial a cada 30s e ao voltar online.
- Checkout e sync têm timeout de 10s SOMENTE depois de GET /sales/checkout-capabilities confirmar protocolo 2 e schema presente. Servidor antigo/incompatível não recebe o POST temporizado. Nenhum retry global foi instalado.
- Conflitos locais são visíveis em detalhes no banner existente. A aplicação não converte comanda divergente em venda avulsa nem reabre caixa fechado.

## Verificação reproduzível (sem dados de clientes)

- Backend: `npx jest sales-resilience.spec.ts sales-delivery.spec.ts --runInBand` (13 testes isolados).
- Frontend: `node --test tests/sales-resilience.test.cjs` (12 testes, incluindo HTTP loopback sem resposta e timeout real de 10s).
- Builds locais: `npm run build` no frontend e backend.
- TypeScript frontend: ainda existem diagnósticos em telas não corrigidas nesta tarefa. Build Vite aprovado não significa que o projeto inteiro esteja sem erros de tipos.

## O que NÃO foi homologado

- Não foi executado checkout real em MySQL, teste ponta a ponta da PWA/IndexedDB real, emissão SEFAZ ou integração iFood real nesta tarefa.
- Concorrência/rollback/restart do backend foram exercitados com doubles de banco. Ainda é necessário verificar locks e rollback efetivos no banco de testes.
- Não foi feita a atualização dos tenants. A nova versão depende de Sale.requestFingerprint e sale_delivery_jobs.

## Próxima etapa obrigatória, local

1. Preparar um banco/tenant de testes com backup e a versão local atualizada, preservando produção. Não executar o frontend novo contra backend antigo como se a compatibilidade já estivesse validada.
2. Lucas aplica o schema exclusivamente pelo Sys-Init, botão Atualizar Bancos, usando o schema desta versão. Não usar prisma migrate/db push no terminal.
3. Confirmar protocolo 2 e testar: venda simples, composto, comanda, perda da resposta após commit, concorrência com mesmo estoque/comanda, reinício, F5 offline, troca de operador e caixa fechado durante recuperação.
4. Revisar pendências legadas/REVIEW com o responsável. Não apagá-las nem reenviá-las com nova chave para contornar o conflito.

Somente depois dessas etapas cabe deliberar sobre homologação. Este relatório não autoriza publicação.
