# Revisão dos apontamentos do Argon — 21/11/2026

## Escopo e método

O fluxo genérico de frente de caixa foi retirado desta rodada conforme orientação do usuário. A cobrança dentro da Agenda continuou no escopo, pois a loja a utiliza. O texto colado foi tratado como hipótese: cada ponto foi confrontado com código, testes e, nos fluxos financeiros, uma cópia integral e temporária de `petsh` e `heart_practpet`. Nenhum cenário de escrita foi executado nas bases originais.

## Resultado por apontamento

| Ponto | Resultado |
|---|---|
| Estorno de venda comum do Pet Shop | **Confirmado e corrigido.** O estorno limpa `chargedSaleId`, volta de Concluído para Pronto, limpa `completedAt` e grava o evento. Se houver adicional pago, exige seu estorno primeiro. Reembolso e nova cobrança de R$ 75,00 passaram no MySQL clonado. |
| Trocas consecutivas com diferença positiva | **A hipótese de duplicidade não se confirmou.** No catálogo real, duas trocas cobraram R$ 10,00 + R$ 40,00 = R$ 50,00, exatamente a diferença entre o serviço original e o final. Apagar a primeira taxa deixaria de cobrar parte do acréscimo. Continua necessária uma regra específica para redução/estorno quando há troca para serviço mais barato após uma diferença já lançada. |
| Responsável da etapa ativa na troca | **Confirmado e corrigido.** Ao escolher outro profissional para o novo serviço, a etapa ativa e o recálculo da comissão usam esse profissional. Etapas anteriores preservam seus executores. |
| Remoção de serviço com combo/comissão | **Confirmado e corrigido.** Comissões pendentes dos componentes são retiradas antes das linhas de serviço. Se houver comissão aprovada, paga ou estornada, a remoção é bloqueada com mensagem clara para preservar o histórico, evitando falha de chave estrangeira. |
| Duração e etapas após edição dos serviços | **Confirmado e corrigido.** Adições e remoções recalculam `endsAt` e `customStages` em atendimentos ainda abertos, respeitando horário final informado explicitamente. |
| Total adicional no detalhe da Agenda | **Confirmado e corrigido.** O resumo passou a usar o mesmo cálculo da cobrança, excluindo pacote, valor coberto e venda já recebida. |
| Escape durante troca de pacote | **Confirmado e corrigido.** O modal do contrato permanece suspenso enquanto o modal de troca ou de recebimento está aberto. |
| PIN para não comparecimento | **Confirmado e corrigido.** Após autenticação, a ação repete `no_show`, preservando o motivo escolhido. |
| WhatsApp | **Corrigido.** Falhas transitórias não encerram as tentativas após a quinta; há espera progressiva limitada a cinco minutos. Um socket antigo não reabre conexão após desconexão manual. A interface não mostra mais número fixo e o teste de envio não altera o texto da regra em edição. A conexão real local voltou após o rebuild. |
| Backup | **Corrigido parcialmente.** Falha no envio ao Drive agora é propagada e backup completo de múltiplas lojas retorna erro se algum tenant falhar; arquivos novos recebem permissão restrita no Linux. Os SQL continuam sem criptografia e os arquivos antigos precisam de revisão de acesso. |
| Usuário desativado com JWT antigo | **Corrigido.** As rotas autenticadas conferem o usuário atual, com cache de 10 segundos para limitar a carga no Heart. Perfil e loja atuais prevalecem sobre dados antigos do token. |

## Testes executados

- Backend final: **71 suítes, 463 testes, 0 falhas**; `nest build` aprovado.
- Frontend: build e TypeScript aprovados; **36 testes passaram, 1 teste de Nginx ignorado**.
- MySQL clonado com planos, preços, comissões e profissionais da loja: **12 etapas, 0 falhas**. Incluiu estorno, nova cobrança, comissão, pacote, Táxi Dog e duas trocas positivas. Relatório detalhado em `VALIDACAO-ROTINA-CLIENTE-2026-11-21.md`.
- Docker local: backend e frontend reconstruídos, MySQL preservado, `/api/health` e página inicial com HTTP 200, login de loja e rota autenticada aprovados; WhatsApp conectado. A base original permaneceu com 68 tutores, 91 pets, 201 agendamentos, 74 contratos, 218 comissões, 10 vendas e nenhuma marca QA.

## Pendências antes de publicar esta árvore

1. A árvore Git tem muitas alterações anteriores desta conversa e scripts de QA não rastreados. É preciso revisar e selecionar o que de fato entrará no commit; nenhum push foi feito nesta rodada.
2. `npm audit --omit=dev` ainda mostra **46 alertas no backend (38 high)** e **3 no frontend (2 high)**. Atualizações de dependências exigem compatibilidade e regressão próprias.
3. A rota de imagens usa IDs globais no Heart e não possui escopo de tenant; corrigir isso requer mudança de esquema e migração de imagens existentes, especialmente antes de expansão para múltiplas lojas.
4. Backups SQL históricos permanecem em texto puro. Credenciais de produção, armazenamento e retenção precisam ser verificados no servidor; os valores locais de desenvolvimento não são prova de configuração da VPS.
5. A primeira carga do frontend ainda contém um bundle grande (~3,7 MB). A etapa visual completa das telas pelo navegador e o teste Nginx ignorado não foram realizados nesta rodada.

**Parecer:** os fluxos principais da loja corrigidos nesta rodada funcionaram na cópia real e no Docker local. Não considero esta árvore pronta para publicação sem a revisão do Git e das pendências de segurança e dependências acima.
