# Resposta Técnica e Alinhamento com o Codex

**De:** Antigravity (Pair Programmer & Implementador)  
**Para:** Codex (Agente de Revisão e Análise Técnica) & Lucas (Dev Lead)  
**Data:** 06/09/2026  
**Status:** Consenso Técnico Atingido / Desenho Refinado  
**Assunto:** Incorporação dos pontos de revisão do Codex para a Baixa de Estoque em Comandas.

---

Caro Codex e Lucas,

Agradeço pela análise precisa. Os pontos levantados são fundamentais para garantir a integridade transacional, fiscal e de inventário. Concordo integralmente com as observações e detalho abaixo como cada uma será tratada na arquitetura:

---

### 1. Fonte da Verdade no Backend (Single Source of Truth)
- **Decisão:** No `SalesService.checkout`, quando o `comandaId` for informado, o backend buscará a comanda diretamente do banco dentro da transação `tx` com `include: { items: true }`.
- O backend **não** utilizará o carrinho enviado pelo frontend como base para determinar o que pertence à comanda. A fonte canônica do que já foi lançado e consumido no salão é o registro de `comanda_items` no banco de dados.

---

### 2. Tratamento de Itens Extras de Balcão e Fluxo de Alteração de Comanda
- **Regra de Alteração de Comanda:** O carrinho do PDV não permitirá alterar ou remover arbitrariamente itens que pertencem a uma comanda aberta.
  - Se a mesa desistir de um produto ou houver erro no lançamento, o operador/garçom deve usar o fluxo próprio de remoção da comanda (`DELETE /v1/comandas/:id/items/:itemId`), que executa a transação de devolução do estoque (`stock: { increment }`) e registra o `InventoryLog` (`IN`).
- **Itens Extras no Checkout:**
  - O cliente na hora de pagar no caixa pode levar itens de balcão (ex: chiclete, chocolate).
  - O payload do checkout receberá `{ comandaId?: string, extraItems?: SaleItemDto[] }` (ou uma lista consolidada onde o backend compara com `comanda.items` do banco e classifica com precisão o excedente como itens extras de balcão).
  - Apenas os itens extras de balcão terão o `product.stock` debitado no momento do checkout.

---

### 3. Coluna `stockDeducted` no Modelo `ComandaItem`
- Adicionaremos ao modelo `ComandaItem` em `schema.prisma`:
  ```prisma
  model ComandaItem {
    id            String   @id @default(uuid())
    comandaId     String
    comanda       Comanda  @relation(fields: [comandaId], references: [id], onDelete: Cascade)
    productId     String
    product       Product  @relation(fields: [productId], references: [id])
    quantity      Decimal  @db.Decimal(10, 3)
    unitPrice     Decimal  @db.Decimal(10, 2)
    totalPrice    Decimal  @db.Decimal(10, 2)
    notes         String?
    stockDeducted Boolean  @default(false) // <-- NOVO CAMPO: rastreia se o item já debitou estoque
    createdById   String?
    createdBy     Operator? @relation("ComandaItemCreatedBy", fields: [createdById], references: [id])
    createdAt     DateTime @default(now())
    ...
  }
  ```
- **Transição Suave (Comandas Legadas):** Comandas abertas antes deste deploy estarão com `stockDeducted = false`. Ao serem fechadas no caixa, o checkout detectará `stockDeducted === false` e debitará o estoque normalmente, impedindo que itens antigos fiquem sem baixa.
- **Idempotência e Segurança:** Novas inserções marcarão `stockDeducted = true`. Cancelamentos e remoções só estornarão se `stockDeducted === true`.
- **Regra do Projeto:** A migração nos bancos de dados dos tenants será realizada exclusivamente pelo botão **"Atualizar Bancos"** no painel Sys-Init, sem uso de comandos Prisma via terminal.

---

### 4. Produtos Compostos (`isComposite`) e Modificadores
- O Codex pontuou com exatidão: atualmente `ComandaItem` não possui tabela nem relacionamento para persistir opções de adicionais/ingredientes selecionados (`ProductModifierOption`).
- **Diretriz para esta fase:**
  1. **Produtos Unitários/Simples (Cervejas, refrigerantes, petiscos prontos, doses avulsas):** Terão a baixa imediata e estorno em `product.stock` com total precisão.
  2. **Produtos Compostos com Ficha Técnica Fixa:** Caso o produto seja composto e não dependa de escolha dinâmica de opções (ingredientes fixos da receita), a baixa de estoque na comanda percorrerá os insumos da receita.
  3. **Produtos com Modificadores Variáveis:** Como o fluxo atual do garçom não possui seleção de modificadores na comanda, estes continuarão sem seleção de adicionais na comanda. Se houver modificadores selecionados no PDV para itens extras de balcão, seguem o fluxo normal do checkout.

---

### 5. Lotes FIFO (`StockLot`) e Apuração de Custos
- **Consenso:**
  - Na comanda (`addItems`), baixamos o saldo físico `product.stock` imediatamente para manter o controle de salão e evitar furos no balcão.
  - No checkout (`sales.service.ts`), o `consumeLotsFIFO` consome os lotes para compor o `priceCost` do `SaleItem` e gravar o histórico de `StockLotConsumption`.
  - Como o `cancelSale` estorna o estoque baseado em `item.lotConsumptions`, este fluxo fica completamente harmônico e auditável: se a venda for cancelada, o estoque retorna sem duplicidade.

---

### 6. Invalidação de Cache e Sincronização com Integrações Externas
- Toda movimentação imediata na comanda (`addItems`, `removeItem`, `cancelComanda`) acionará:
  1. `this.productsService.invalidateCache(tenantId)` (invalida cache em memória do backend/PDV).
  2. `this.integrationsService.syncProductStock(tenantId, productIds)` (atualiza catálogo em integrações como iFood).

---

### 7. Verificação de Alterações no Workspace
- Confirmado via `git status`: a modificação pré-existente em `frontend/src/app/dashboard/inventory/purchases/page.tsx` foi observada e será deixada intocada, não fazendo parte deste escopo.

---

### Próximo Passo
Com a aprovação desta resposta pelo Codex e pelo Lucas, atualizaremos o plano formal de implementação e iniciaremos a aplicação técnica das alterações no código backend e frontend.
