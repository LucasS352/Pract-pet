# Pract Pet — reanálise pré-produção

Data: 09/11/2026, America/Sao_Paulo. Ambiente: Docker local, frontend `localhost:3531`, API `localhost:3530`, MySQL local, tenant de QA PetSh. Este parecer combina o roteiro completo de 08/11 com os retestes de 09/11. Não é uma medição da VPS de produção.

## Parecer

**OK técnico para implantar de forma controlada e executar o smoke test na infraestrutura final, considerando até 30 colaboradores simultâneos. Ainda não é aprovação para abrir a operação sem essa conferência final.** As funções críticas testadas estão operacionais e o perfil `operator` agora é bloqueado nas leituras gerais de Vendas e Caixa. Na versão final, 30 perfis simultâneos fizeram 360 consultas sem erro, com p95 2,03 s e p99 4,82 s. O envio real de WhatsApp foi confirmado pelos três tutores autorizados. Uma base histórica grande e a configuração da infraestrutura final ainda precisam de homologação.

## Funcionalidades confirmadas

| Área | Resultado observado |
|---|---|
| Tutores | Cadastro, edição, persistência de endereço, busca por telefone e bloqueio de duplicidade aprovados no roteiro E2E. |
| Pets e serviços | Dados de pet persistidos; busca/filtros e exportação CSV; matriz de preços por porte/pelagem e fallback aprovados. |
| Pacotes | Quatro sessões, exceção de semana, transporte, reserva, consumo e renovação; oito disputas pela última sessão aceitaram apenas uma. |
| Agenda e Táxi Dog | Agendamento avulso, extra, reagendamento, estados e manifesto de transporte testados. |
| Hoje | Quatorze pets sintéticos visíveis; avanço de etapas e foto pela tabela; link noturno abre o dia local correto. Outra tela recebe atualizações em até um ciclo de 15 segundos. |
| Financeiro | Cobrança de R$ 125 e recebimento idempotente; comissões por porte. Receita de 24 meses reconciliada: API R$ 5.405 = vendas SQL R$ 3.195 + pacotes diretos R$ 2.210. Atendimento não pago não aumenta receita. |
| Portal do tutor | Token exigido, vínculo pet/tutor verificado e preço recalculado no servidor. Oito reservas simultâneas para o mesmo pet/horário: uma criada, sete recusadas. |
| Acesso de colaborador | Perfil `operator` com JWT assinado: Hoje 200; Métricas, Vendas e Caixa 403. A correção do servidor foi compilada no Docker local; 33 testes focados passaram. |
| Recuperação | Backup anterior aos testes restaurado em MySQL 8.0 descartável; contagens conferidas: 13 pets, 12 tutores, 75 atendimentos e 30 vendas. |
| WhatsApp | Luc, Andreia e Tarcisio confirmaram o recebimento de três testes diretos, seis confirmações/lembretes, retorno de cliente ausente em 15 dias, foto em “pet pronto” e dez mensagens de Táxi Dog. O Tarcisio também confirmou três mensagens no reteste de ordem. Os jobs terminaram `SENT`, com uma tentativa. |
| Táxi Dog | Corrigida a gravação de modalidade nos agendamentos avulsos e do portal. Confirmações, lembretes e “pet pronto” variam entre apenas buscar, apenas levar e ida e volta. O aviso “a caminho” depende da ação explícita de saída, com idempotência. |
| Foto durante etapa | O colaborador pode marcar “enviar foto” em Hoje ou Agenda. A imagem e o recado são colocados na fila do WhatsApp conectado. No reteste de Banho para o Tarcisio, o job `STAGE_PHOTO` terminou `SENT` após uma tentativa, com a imagem correta; o tutor confirmou recebimento da foto e do recado. |
| Última sessão de pacote | Plano e pet fictícios de preço zero: a sessão foi reservada e consumida, o job `PACKAGE_LAST_SESSION` foi enviado com “restam 0 sessões”, e o Tarcisio confirmou recebimento. Confirmação do agendamento e “pet pronto” também terminaram `SENT`. |
| Mobile emulado | Android 412×915 e iPhone 390×844: Hoje e Agenda renderizados sem rolagem horizontal ou erro de página; capturas guardadas em `docs/homologacao/2026-11-09/`. |

O roteiro original, os bugs e as capturas estão em `docs/homologacao/2026-11-08/RELATORIO-PRE-PRODUCAO.md`; os retestes funcionais em `docs/homologacao/2026-11-08/CORRECOES-E-RETESTE.md`.

## Simultaneidade e resposta

| Carga | Resultado |
|---|---|
| 50 clientes virtuais com login da loja e PIN de QA, 600 leituras de Hoje/Agenda | Zero erros; p95 2,61 s, p99 2,68 s, máximo 2,81 s. |
| 50 JWTs distintos com perfil `operator`, 600 leituras de Hoje/Agenda, gerador fora do contêiner | Zero erros; p95 3,40 s, p99 13,85 s, máximo 15,88 s. |
| 30 JWTs com perfil `operator`, 360 leituras | Zero erros; p95 entre 1,84 e 1,92 s em duas execuções locais. |
| 30 JWTs com perfil `operator`, 360 leituras, gerador no host, versão final | Zero erros; p95 2,03 s, p99 4,82 s, máximo 5,52 s. |
| Três mudanças de etapa em atendimentos diferentes | Três respostas 200 e três estados persistidos; lote concluído em 201 ms. |
| 50 acessos administrativos com relatórios incluídos, 600 leituras | Zero erros; p95 5,98 s, p99 18,41 s, máximo 25,17 s. |

Os clientes virtuais com PIN usaram a mesma conta da loja e o mesmo colaborador de QA. Os JWTs de perfil `operator` foram assinados dentro do backend para testar autorização e carga; não representam 50 contas reais cadastradas. Sem SLA acordado, estes tempos descrevem o ambiente local e não certificam capacidade da VPS.

As medições de carga foram feitas antes dos ajustes finais das mensagens de Táxi Dog e foto de etapa. Esses ajustes foram compilados e testados funcionalmente, mas a carga não foi repetida depois deles.

## Limites que impedem aprovação plena

1. **Capacidade:** o volume informado para o lançamento é de 11 a 30 colaboradores; esse nível foi aprovado na carga local, sem erros. Com 50 operadores, o p99 chegou a 13,85 s; com 50 acessos administrativos, a 18,41 s. O pool Prisma do tenant está configurado para dez conexões por instância; fila no banco é uma hipótese, ainda sem perfil de consulta que a confirme. Repetir na infraestrutura final com o volume esperado e dados representativos antes de liberar os usuários.
2. **Base histórica:** listas de tutores, pets e atendimentos ainda têm limites de 200, 300 e 1.000 registros por consulta, sem paginação completa comprovada. Os KPIs derivados dessas listas podem ficar incompletos em lojas maiores.
3. **Integrações e dispositivos:** o envio real pelo WhatsApp conectado, o cron e a foto foram confirmados no ambiente local pelos três tutores autorizados. Falta validar HTTPS/domínio e câmera em aparelhos físicos Android e iOS; múltiplos tenants reais e recuperação cronometrada na infraestrutura final também faltam.
4. **Credencial administrativa compartilhada:** o PIN sobre uma sessão administrativa ainda permite omitir o cabeçalho operacional e usar o JWT administrativo. O cliente informou que a conta administrativa ficará restrita aos administradores. Essa política precisa ser aplicada também no uso dos dispositivos; o perfil `operator` independente foi bloqueado nas rotas financeiras testadas.
5. **Cobertura funcional:** criação/edição de serviço e cadastro de pet completos pela interface, todos os combos/cancelamentos/estornos e fechamento de comissões de mês encerrado ainda não tiveram matriz E2E completa.
6. **Configuração de produção:** a sintaxe de `docker-compose.production.yml` passou em `docker compose config --quiet` com valores temporários. Os links do portal nas mensagens locais apontaram para `localhost:3531`, inacessível no telefone do tutor. Configurar `PUBLIC_APP_URL` com o domínio HTTPS público, validar o link recebido no celular e conferir os segredos reais no destino antes da abertura.
7. **Sequência das mensagens:** no primeiro teste de Táxi Dog, a saída para entrega pôde entrar na fila antes da mensagem “pet pronto”. A ordem foi corrigida e retestada com o Tarcisio: confirmação → pronto para entrega → motorista a caminho. Os horários de `sentAt` e o recebimento no aparelho confirmaram a sequência.

## Critério para abrir aos usuários após o deploy

1. Conferir `docker compose config --quiet` com as variáveis reais, HTTPS no domínio e contêineres saudáveis; manter backup anterior ao update e caminho de retorno.
2. Em computador e celular reais, validar login administrativo e de colaborador, Hoje, Agenda, foto/câmera, portal, pacote, recebimento e bloqueio de Vendas/Caixa para o perfil `operator`.
3. Repetir carga representativa de até 30 colaboradores na VPS e comparar p95/p99 e erros com a base local; investigar se o p99 se aproximar da cauda observada com 50 acessos.
4. Com destinatário autorizado, validar na infraestrutura final confirmação, lembrete, “pet pronto” com foto, Táxi Dog por modalidade e link do portal HTTPS. Conferir no aparelho a ordem “pronto” antes de “saiu para entrega”.

Cumpridos esses itens, o parecer passa de **OK para implantar e testar** a **OK para abrir a operação**. A implantação não foi executada nesta reanálise.

## Evidência e estado do código

- Reteste de perfil `operator` após a correção: `/petshop/overview` 200; `/petshop/metrics`, `/sales`, `/cash-registers` 403.
- Backend: build local e Docker aprovados; 33 testes focados de autenticação/acesso aprovados. Antes desta alteração, a suíte completa tinha 329 testes aprovados; frontend tinha 36 aprovados e um ignorado.
- Contêineres locais backend, frontend e MySQL estavam em execução; a alteração de acesso foi aplicada ao backend local. Nenhuma medição foi feita na VPS de produção.
- Scripts reproduzíveis: `scripts/qa-role-access-20261109.cjs`, `scripts/qa-role-load-20261109.cjs`, `scripts/qa-role-load-host-20261109.cjs`, além dos scripts da auditoria de 08/11.
- Evidências adicionais: `docs/homologacao/2026-11-09/mobile-petshop.json`, `whatsapp-live.json`, `inactive-tarcisio.json`, `whatsapp-appointments.json`, `whatsapp-photo.json`, `taxi-messages.json`, `taxi-order.json`, `stage-photo.json` e `package-alert.json`. Os JSONs de WhatsApp contêm links de portal com token e devem permanecer restritos à equipe de homologação.
- Dados fictícios do teste de ausência, dos seis agendamentos de mensagens/Táxi Dog, do reteste de ordem, da foto de etapa e do pacote removidos. Cada limpeza foi conferida pelo identificador e tag QA. As duas imagens de estágio iniciais e a imagem da etapa final foram removidas.
