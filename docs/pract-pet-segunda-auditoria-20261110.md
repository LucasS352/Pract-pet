# Pract Pet — segunda auditoria técnica (10/11/2026)

## Escopo e estado do Git

Auditoria iniciada sobre `visual/mobile-refactor-approved-designs` (`b3fab69`), incluindo o commit visual do usuário. A base remota no início da auditoria era `origin/main` em `355acd2`. O diff de código ficou limitado a Pet Shop, Táxi Dog, agenda, componentes de foto/produto compartilhado e respectivos testes. `git diff --check` não apontou erros. Os muitos `scripts/qa-*.cjs` preexistentes e não rastreados foram preservados. Não houve deploy, migração Prisma ou escrita em bases reais. **Antes do Portainer, confirme que o SHA da revisão publicada contém as correções e os testes deste relatório.**

## Resumo executivo

Onze achados de código foram verificados: nove corrigidos durante esta sequência de auditorias, dois pendentes. Oito já existiam na base anterior às correções operacionais; três surgiram nas alterações de interface/rotas (retorno a endereço repetido no roteiro, limpeza do histórico dos modais em React StrictMode e perda da busca de tutor no modal visual). Os dois pendentes são preexistentes. A divergência de esquema entre bases locais e as falhas gerais de lint/teste estão registradas separadamente como riscos de ambiente/qualidade, não contabilizadas como novos bugs de código.

**Veredito: Reprovado para liberação em produção.** A rota pública de imagens permite obter mídia de qualquer tenant ao conhecer seu UUID, inclusive fotos do Pet Shop, e não há vínculo de ownership no armazenamento global. As correções operacionais passaram nos testes abaixo, mas esse bloqueio de segurança permanece. Android físico, Google Maps nativo, teclado e permissões de câmera também dependem de homologação manual.

## Achados de código

| ID / prioridade | Evidência e causa raiz | Correção ou pendência |
| --- | --- | --- |
| A1 P0, preexistente | `backend/src/petshop/petshop-packages.service.ts`: a seleção de pacote podia incluir um `serviceId` que não pertencia ao agendamento; a reserva alterava saldo/ledger. | Passou a verificar o serviço do próprio agendamento antes de reservar. Teste em MySQL isolado confirmou rollback sem alterar saldo/ledger. |
| A2 P1, preexistente | O agendamento comum oferecia e reservava contratos `paymentStatus=pending`. | Consulta de disponíveis exige `paid`; reserva comum rejeita pendentes. A exceção interna `allowPendingPayment` existe apenas para sessões criadas na transação de contratação. Teste isolado passou. |
| A3 P0, preexistente | Transporte gratuito aceitava qualquer pacote ativo do pet, mesmo sem reserva para o serviço do agendamento ou com modalidade incompatível. | Verificação transacional das reservas efetivas e da modalidade; frontend só marca cobertura quando um serviço selecionado usa o pacote compatível. Teste isolado passou. |
| A4 P1, preexistente | Checagem de conflito profissional fora da transação admitia dois agendamentos/reagendamentos concorrentes. Reproduzido em duas criações simultâneas, ambas aceitas antes da correção. | Lock da linha do profissional e checagem dentro da transação, também no reagendamento. Novo teste isolado: uma operação aceita e uma rejeitada em cada disputa. |
| A5 P1, preexistente | Coletas vencidas podiam desaparecer por filtro limitado ao dia; contagem por linhas de serviço duplicava atendimentos. | Endpoint de coletas pendentes anteriores e resumo por ID de agendamento compartilhado entre telas. Jest e testes Node cobrem atraso, cancelamento, check-in e deduplicação. Consulta histórica ainda sem limite; monitorar volume. |
| A6 P2, preexistente | Respostas assíncronas antigas podiam sobrescrever tutor/pet, data e contadores após troca rápida. | Abort/controle de sequência nas telas e limpeza de seleções dependentes. Inspeção e teste de navegador com dados simulados; concorrência real de rede não foi medida. |
| A7 P2, introduzido nas correções anteriores | Dedupe global de endereço no manifesto eliminava o retorno A→B→A. Endereço ausente podia ser omitido silenciosamente. | Preserva endereços não consecutivos, agrupa apenas paradas consecutivas no mesmo local e bloqueia URL com parada sem endereço. Nove testes Node de Táxi Dog/rota passaram. |
| A8 P2, introduzido nas correções anteriores | Cleanup do histórico de modais podia fechar modal recém aberto em StrictMode; o teste no navegador reproduziu a falha. | Token estável, cancelamento de cleanup tardio e tratamento de Voltar/Escape. Build de produção: seis fluxos de modal passaram em Edge Chromium emulado. |
| A9 P1, introduzido no modal visual | `frontend/src/pages/petshop/PetshopAgendaPage.tsx`: a abertura zerava `pets`, enquanto a busca de tutor existente não era renderizada. Novo agendamento comum não tinha como escolher pet. | Restaurado campo compacto de busca por nome/telefone, escolha de tutor, lista de pets desse tutor e troca de tutor com limpeza de pacotes/serviços. Playwright na build de produção confirmou tutor→pet→serviço/pacote→payload POST correto. |
| A10 P0, preexistente, **pendente** | `backend/src/app.controller.ts:19` serve `GET /products/uploads/images/:id` sem autenticação/tenant; `backend/prisma/heart.schema.prisma:156` guarda `Image` global sem tenant/owner. `backend/src/petshop/petshop.service.ts:72` usa a mesma URL para fotos do Pet Shop. Pedido anônimo para UUID falso retornou 404 em vez de 401. Quem conhece UUID válido pode obter a mídia; não houve teste com imagem de cliente real nem evidência de exploração. | Exige modelo de ownership e estratégia compatível com portal do tutor/WhatsApp e imagens públicas do catálogo. Não foi feita alteração de esquema nem quebra das URLs existentes sem desenho seguro e homologação. |
| A11 P2, preexistente, **pendente** | `ProductsService.create` verifica nome com `findFirst` e depois insere; nome não tem restrição única no esquema tenant. Duas criações simultâneas com nomes iguais e códigos diferentes podem ultrapassar a validação. Corrida não executada. | Duplicação sequencial foi rejeitada em MySQL isolado. Correção robusta requer restrição/serialização compatível com dados legados; migração não autorizada. |

## Testes executados

| Método | Comando / ambiente | Resultado | Limite |
| --- | --- | --- | --- |
| Build + TypeScript | `cd frontend && npm run build` (inclui `tsc --noEmit`) | Aprovado. Vite gerou `dist` e PWA. | Avisos de bundle, `xlsx` e Browserslist; sem falha de build. |
| Build backend | `cd backend && npm run build` | Aprovado. | Compilação não prova integridade de produção. |
| TypeScript separado | `cd frontend && npm run typecheck`; `cd backend && npx tsc --noEmit` | Ambos aprovados. | Sem teste de comportamento. |
| Jest backend completo | `cd backend && npm test -- --runInBand` | 55 suítes, 358 testes aprovados. | Não substitui integração entre serviços externos. |
| Jest focado | `npx jest --runInBand src/petshop/petshop-access.guard.spec.ts src/petshop/petshop-overdue-pickups.spec.ts src/petshop/petshop-packages.spec.ts` | 3 suítes, 34 testes aprovados. | Serviços simulados. |
| Node frontend focado | `node --test tests/taxi-operations.test.mjs tests/taxi-route.test.mjs` | 9/9 aprovados. | Prova construção de rota/contadores, não abertura no aplicativo Maps. |
| Node frontend completo | `cd frontend && node --test tests/*.test.*` | 46 testes: 44 aprovados, 1 reprovado, 1 ignorado. | Falha preexistente de harness em `tests/sales-resilience.test.cjs` (`@/lib/client-id` não simulado); não ligada ao Pract Pet. |
| Persistência isolada | `node --test test/petshop-isolated-db.audit.cjs` em duas bases efêmeras `127.0.0.1:3311/practpet_audit{,_b}` com dados inventados | 1/1 aprovado; incluiu pacotes, saldo/ledger, corrida de profissional, coletas antigas, produto/estoque, código de barras igual em tenants distintos e rejeição de acesso cruzado. | Esquema clonado sem dados de `pet_teste`; não prova compatibilidade de todos os tenants de produção. Docker local ficou indisponível após a execução, sem evidência de contêiner de auditoria ativo. |
| Navegador da build de produção | Edge Chromium/Playwright, APIs simuladas, larguras 390, 412 e 768 px | 12 páginas, 6 fluxos de modal e 1 fluxo tutor→pet→serviço/pacote→POST passaram; sem overflow horizontal ou `pageerror`; Escape, Voltar e scroll lock verificados. | Não é Android físico nem teste da rede/API real. A primeira execução abortou por disputa do histórico entre duas navegações do script; o teste aguardou o fechamento assíncrono e passou. |
| Lint frontend | `cd frontend && npm run lint` | Reprovado antes da análise: `eslint-config-next` importado em `eslint.config.mjs` não está instalado/declarado. | Preexistente. |
| Lint backend | `npx eslint "{src,apps,libs,test}/**/*.ts" --no-fix --format json` | Reprovado: 30.247 erros e 581 avisos em 220 arquivos. | Nos arquivos tocados, 1.883 ocorrências; 180 caem em linhas adicionadas, incluindo 90 de Prettier e 90 de tipos `any`/acessos inseguros. Logo, não são todas preexistentes. Nenhuma formatação em massa foi feita. |
| Diff | `git diff`, `git show HEAD`, `git diff --check` | Sem alteração rastreada fora do escopo e sem erro de whitespace. | Arquivos não rastreados antigos não entraram no diff. |

## Matriz de validação funcional

| Funcionalidade | Tipo de teste | Resultado | Problemas / correções adicionais |
| --- | --- | --- | --- |
| Coletas atrasadas, dias anteriores, estados e contadores | Jest, Node e MySQL isolado | Aprovado nos cenários automatizados | Consulta histórica sem limite merece observação de desempenho em homologação. |
| Manifesto, múltiplos destinos e retorno ao endereço anterior | Node e inspeção | Aprovado para URL | Maps Android real: **não executado**. Conferir todos os waypoints e trechos no aplicativo. |
| Tutor → pet → serviços/pacotes → agendamento | Playwright com APIs simuladas, inspeção, Jest e MySQL isolado | Aprovado nos cenários executados | Busca sob carga, troca rápida em rede real e fluxo completo em Android: **não executados**. |
| Produto, estoque, preço, categoria e PDV | Inspeção e MySQL isolado | Aprovado para persistência testada | UI usa o mesmo `POST /products`; nome concorrente permanece pendente. Upload de imagem em dispositivo: **não executado**. |
| JWT, permissão operacional e isolamento de dados | Jest, inspeção e duas bases isoladas | Aprovado nos endpoints testados; **reprovado** para mídia | Endpoint público global de imagens sem ownership. |
| Layout, modal, Escape/Voltar e scroll lock | Playwright em Edge Chromium | Aprovado no navegador automatizado | Teclado, barra do sistema, câmera, galeria e Voltar físico Android: **não executados**. |

## Riscos restantes e encaminhamento

1. **Bloqueio de segurança A10:** definir ownership para mídias já armazenadas e política para URLs públicas do PDV/portal/WhatsApp; depois testar acesso anônimo, tenant A/B e cache/CDN. Não publicar esta revisão como se o isolamento de mídia estivesse validado.
2. **Esquema local divergente:** a base local `practpet` não contém `pet_services.customStages`, enquanto `pet_teste`/`petsh` contêm. O teste isolado usou esquema de `pet_teste`. Não há prova de que o banco de produção esteja divergente; verificar compatibilidade pelo fluxo Sys-Init antes do Portainer. Nenhuma migration foi executada.
3. **Homologação Android:** testar câmera traseira/galeria, upload, teclado virtual, barra inferior, modais aninhados, Escape/Voltar físico, rolagem longa e Maps com várias paradas. Emulador desktop não aprova esses itens.
4. **Portainer:** conferir o SHA, a branch e a imagem da revisão no Git antes de atualizar a stack. Este relatório não atesta o banco de produção nem substitui a homologação física do Android.

O relatório inicial `pract-pet-analise-e-validacao-20261109.md` é histórico; sua conclusão de aptidão para homologação foi substituída por este veredito após encontrar A10.
