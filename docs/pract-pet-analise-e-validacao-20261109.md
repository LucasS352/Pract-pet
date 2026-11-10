# Pract Pet — análise técnica e validação (09/11/2026)

## Estado e proteção

- Branch de trabalho: `codex/pract-pet-mobile-operations-20261109`, criada sobre `codex/petshop-production-release` (dois commits locais à frente do remoto).
- Os scripts `scripts/qa-*.cjs` já estavam não rastreados antes da mudança e foram preservados.
- Nenhum deploy, migration, comando Prisma de alteração de banco ou escrita em dados de clientes foi executado. Os testes novos usam mocks e objetos em memória.

## Arquitetura e regras relevantes

| Camada | Implementação | Regra preservada |
| --- | --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind, React Router; telas em `frontend/src/pages/petshop` | Agenda, operação Táxi Dog, pacotes, fotos e catálogo compartilham tipos de atendimento. |
| Backend | NestJS; `PetshopController` com `JwtAuthGuard` e `PetshopAccessGuard`; `PetshopService` | Status e transporte são validados no serviço. `checkInNotes` armazena o transporte serializado; não foi alterado. |
| Banco | MySQL por tenant via Prisma; Heart mantém cadastro de tenants | `TenantContextService` e `TenantConnectionManager` escolhem a conexão. Nenhum endpoint novo aceita ID de tenant do navegador. |
| Compartilhamento | `AddProductModal` e endpoints `/products` são usados pelo Pract Pet e pelo PDV | Tema visual do produto limitado à variante `petshop`; payload, validação, estoque e upload não mudaram. |

Dependências: o status `ready` precisa do modo de transporte para exibir o texto correto; a consulta de coletas antigas alimenta tanto a página exclusiva quanto os widgets; a busca de pacotes depende do pet escolhido após o tutor; a rota do Maps depende da ordem do manifesto, mas não altera o checklist ou a conclusão operacional.

## Plano de testes aplicado

| Fluxo | Validação automatizada | Validação manual restante |
| --- | --- | --- |
| Coletas atrasadas | Jest verifica corte temporal, status aberto, modalidade com coleta e conexão do tenant; teste de resumo cobre atraso e cancelamento | Criar coleta 14h em base isolada, conferir após 16h e no dia seguinte em Hoje, Agenda e Táxi Dog. |
| Contadores | Teste de resumo garante deduplicação e classificação; ambas as telas usam `summarizeTaxiAppointments` | Conferir os mesmos períodos e filtros nas telas em 360–430 px e desktop. |
| Manifesto | Testes de quatro destinos, endereços repetidos e divisão em trechos | Abrir no Maps Android e confirmar todos os destinos e sequência. |
| Tutor/pet/pacotes | Jest verifica busca limitada e tenant; compilação verifica vínculo de tipos | Buscar nome e telefone, trocar tutor, selecionar pet com pacote ativo, salvar em base isolada e verificar saldo. |
| Câmera Android | Build/typecheck | Câmera traseira e galeria em Chrome Android, upload/otimização e foto no portal do tutor. |
| Agenda mobile/modais | Build/typecheck | Rolar semana longa, abrir/fechar modais, usar Voltar físico e barra inferior sem travar. |
| Produto | Testes existentes de serviço/controlador de produtos; build/typecheck | Conferir campos, upload, salvar em base isolada e localizar no PDV sem afetar estoque real. |
| Multi-tenant | Teste do novo serviço com conexão tenant e suíte existente de guard | Repetir em duas empresas de teste, sem enxergar dados cruzados. |

## Resultado e limites

- Builds de frontend e backend aprovados; 23 testes Jest focados e 4 testes Node aprovados após a auditoria.
- O build do frontend emite avisos anteriores sobre tamanho do bundle, importação mista de `xlsx` e base Browserslist antiga. Esses avisos não foram alterados nesta tarefa.
- Os testes de aparelho, Maps nativo e persistência em banco isolado continuam pendentes. Nenhuma conclusão de comportamento em Android real é inferida do build.

## Auditoria final — 10/11/2026

- Diff completo revisto: as mudanças rastreadas pertencem aos fluxos Pract Pet solicitados; `AddProductModal` é compartilhado com o PDV, mas a variante visual só é ativada no Pract Pet. Os scripts `scripts/qa-*.cjs` já eram arquivos locais não rastreados e não foram alterados. `git diff --check` passou.
- Corrigido o `PetshopAccessGuard` para os três GETs necessários ao colaborador operacional (`booking-search`, `overdue-pickups` e detalhe do pet). Testes negam rotas administrativas e subcaminhos.
- Corrigidas respostas antigas ao trocar tutor, preenchimento tardio de endereço na abertura por `petId`, navegação de modais aninhados, identificação de Android em orientação horizontal para o limite do Maps e invalidação dos links quando mudam data, atendimentos ou paradas.
- Backend: `npm run build` aprovado; suíte Jest completa antes do ajuste no guard, 353/353 aprovados; Jest focado após os ajustes, 23/23 aprovados. Um teste adicional usa duas conexões simuladas para verificar a separação dos resultados por tenant. Frontend: `npm run build` com `tsc --noEmit` aprovado após as correções principais; teste focado de Táxi Dog/rota, 4/4 aprovado. Após o último ajuste de limpeza de links, o typecheck passou novamente.
- Suíte geral Node do frontend: 41 testes, 39 aprovados, 1 falhou, 1 ignorado. A falha é no teste de vendas `sales-resilience.test.cjs`: o harness não fornece `@/lib/client-id` importado por `store/cart.ts`. Ambos os arquivos já estavam assim em `HEAD` e não pertencem a este diff.
- Lint geral do frontend não iniciou: `eslint.config.mjs` importa `eslint-config-next`, ausente das dependências instaladas e declaradas. Lint geral do backend, executado sem o `--fix` do script, falhou com 30.721 ocorrências distribuídas pelo repositório, inclusive regras de formatação/CRLF. O lint restrito aos arquivos de backend tocados também falha com centenas de regras de tipo/estilo já presentes nesses arquivos. Essas falhas foram registradas separadamente; nenhum arquivo fora do escopo foi reformatado.
- Inspeção de código confirmou o contexto de tenant nos novos serviços, o guard JWT/operacional, a consulta de pacotes pelo pet e o mesmo payload `POST /products` do modal compartilhado. Não houve teste integrado em dois bancos, persistência de produto em base isolada ou execução real do fluxo completo de agendamento.
- A construção de URLs do Maps foi verificada por teste de ordem, deduplicação, divisão de trechos e limite mobile. A abertura, os waypoints e a navegação no aplicativo Maps Android **não foram executados**.
- Câmera/galeria, Voltar físico, modais, rolagem, responsividade e barra de navegação em Android real **não foram executados**. A homologação deve cobrir esses cenários antes de considerar deploy.

Conclusão registrada naquela data: tecnicamente apto a iniciar homologação controlada; sem liberação para produção até validação manual e resolução dos gates gerais de lint/teste.

**Revisão de 10/11/2026:** a segunda auditoria encontrou um bloqueio de isolamento de mídia. A conclusão acima foi substituída pelo veredito **Reprovado** do relatório [Segunda auditoria técnica](./pract-pet-segunda-auditoria-20261110.md). Não use este relatório histórico como autorização de deploy.
