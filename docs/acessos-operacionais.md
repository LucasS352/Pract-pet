# Acessos operacionais por módulo

Implementado em 18/09/2026. A atualização dos bancos é manual pelo Sys-Init. Durante a correção de compostos, backend e frontend do Docker local foram reconstruídos e recriados a pedido do usuário; os schemas do container existente já coincidiam com os locais.

## Ativação e compatibilidade

- `restaurante`: lista somente colaboradores ativos com cargo Garçom (aceita GARCOM e variações de acento/caixa).
- `kds`: habilita links de Cozinha, Bar, Bar 1, Bar 2 e Separar/servir.
- `carvoaria`: habilita a estação Carvoaria independentemente de cozinha/bar.
- Qualquer um desses módulos ativa o filtro estrito de caixa: Caixa, Gerente, Admin ou gerente legado sem cargo. Um Garçom explicitamente cadastrado não entra no caixa por ter permissão de visualizar recebimentos.
- Sem os três módulos, mantém-se o filtro anterior do PDV, inclusive colaboradores sem cargo. Habilitar apenas Comandas não ativa o isolamento.
- O PDV continua acessado por usuário. Não existe link/token de caixa.

## Uso

Em **Configurações da Empresa → Acesso dos dispositivos**, gere o link do setor e copie-o para o tablet/notebook/celular. O segredo é exibido uma vez e fica no fragmento de `/acesso#…`, removido do endereço após a abertura. O banco guarda apenas SHA-256 do segredo aleatório de 256 bits.

Garçons escolhem seu nome e informam o PIN. O dispositivo KDS entra diretamente na estação. A sessão do garçom e a sessão do dispositivo não expiram por tempo. Sair limpa a sessão; limpar os dados do navegador também exige novo acesso. Sessões tradicionais da loja/caixa mantêm sua duração anterior.

Em **Equipe → Colaboradores → Editar**, o administrador pode preencher ou gerar outro PIN e salvar. A sessão do garçom contém uma versão HMAC derivada do hash atual do PIN: alterar o PIN invalida as sessões anteriores na próxima requisição. O servidor consulta também atividade/cargo. Desativar o módulo bloqueia o acesso; revogar o link bloqueia os dispositivos vinculados a ele. Gerar outro link não revoga os anteriores: use o botão Revogar.

## Restrições no servidor

- JWT de dispositivo tem finalidade `station-session`, tenant e link próprios; não é uma sessão administrativa.
- `JwtAuthGuard` aplica lista fechada de métodos/rotas. Caixa, vendas, financeiro, administração e gerenciamento de usuários não são liberados para links operacionais.
- Garçom precisa de token de operador válido após o PIN para operar comandas. O servidor fixa autoria do lançamento/criação pelo operador autenticado. No KDS só confirma entrega.
- KDS filtra a consulta e valida atualização pela estação autenticada; parâmetros no navegador não ampliam o acesso.
- Com isolamento ativo, abertura de caixa e checkout verificam o token e o cargo do operador, inclusive contra IDs trocados no corpo da requisição.

## Produtos

`Product.barStation` aceita BAR, BAR_1 e BAR_2; BAR é o padrão para produtos existentes. Itens de comanda guardam o destino no lançamento. Sem módulo, não entram no KDS.

No Garçom, tocar em composto carrega os detalhes faltantes e abre os adicionais. Produtos com equipamento numerado permitem escolher primeiro o equipamento. Os adicionais aparecem abaixo do item.

### Correção do popup de compostos — 18/09/2026

- O popup do Garçom usa `createPortal(..., document.body)` para ficar acima do modal Adicionar Item; o contêiner fixo da página criava uma camada que escondia os adicionais.
- Os grupos faltantes são lidos em `GET /products/:id/composition`, cuja resposta é um array, e incorporados ao produto. Não existe `GET /products/:id` para essa leitura.
- `selectProduct` e `handleAddItem` usam a mesma busca. Confirmar envia `modifiers: [{ optionId }]` para a comanda; cancelar não lança. No Garçom, `autoConfirmSingleOption=false` mantém a confirmação mesmo com uma opção; o caixa mantém seu padrão anterior.
- A política da sessão de garçom libera somente o GET de composição, sem liberar configurações de produtos nem gravações administrativas.
- Teste de navegador: `scripts/garcom-composites-ui-test.cjs`, 390px/1366px, API simulada com formato/rota reais, checagem de sobreposição via `elementFromPoint`, seleção, envio, cancelamento e botão inferior.

## Aplicação dos schemas

1. Disponibilizar a versão com os schemas e clientes Prisma correspondentes.
2. No Sys-Init, usar **Atualizar Bancos**, incluindo **Heart** (`station_access_links`) e os **tenants** (`Product.barStation`). A nova coluna de produtos precisa existir nos bancos atendidos pela nova versão, inclusive nas adegas; seu comportamento operacional continua legado quando os módulos estão desligados.
3. Conferir cargos dos colaboradores antes de ativar módulos e gerar links.
4. Homologar com um tenant de restaurante e um tenant de adega antes da liberação geral.

Não foram executados `db push`, migrations ou alterações diretas em bancos reais. Atualização local da correção: `docker compose build frontend backend` e `docker compose up -d --no-deps --force-recreate backend frontend`. Não houve publicação em servidor remoto.

## Validação local

- Testes: `npm test -- --runInBand station-access.spec.ts kds.spec.ts comandas-kds.spec.ts` (backend).
- Builds: `npm run build` em backend e frontend.
- O `tsc --noEmit` do frontend ainda aponta problemas de tipagem em áreas preexistentes (dashboard, importação XML, estoque, portal de grupos e configuração Vite); o build Vite não realiza essa checagem.
- Correção de compostos: testes de navegador passaram também no bundle servido em `http://127.0.0.1:3521/garcom`, com API simulada para não criar pedidos. O backend em execução permite composição para WAITER e a bloqueia para KDS. `/garcom` e `/sw.js` respondem 200; APIs protegidas respondem 401 sem credencial. Fazer hard-refresh nos dispositivos que ainda executam o bundle anterior.
