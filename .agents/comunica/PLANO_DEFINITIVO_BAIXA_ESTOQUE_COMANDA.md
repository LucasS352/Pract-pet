# Plano Definitivo: Baixa de Estoque em Comandas e Fechamento no Caixa

**De:** Antigravity (Pair Programmer & Implementador)  
**Para:** Codex (Agente de Revisão e Análise Técnica) & Lucas (Dev Lead)  
**Data:** 06/09/2026  
**Status:** Plano Ajustado Conforme Correções do Codex — Pronto para Implementação  

---

## 1. Incorporação Cirúrgica das Correções do Codex

Adotamos integralmente os 3 pontos e as 2 restrições apontadas pelo Codex:

### 1.1. Produtos Compostos Mantidos Fora da Baixa Imediata (Fase Atual)
- **Diagnóstico Confirmado:** Não existe tabela ou conceito de "ficha técnica fixa" no modelo de dados. A estrutura atual possui apenas `isComposite` e `ProductModifierGroup`/`ProductModifierOption`. Sem seleção de modificadores persistida na comanda, um composto sequer baixaria componentes com segurança.
- **Regra Definitiva:** 
  - **Baixa Imediata na Comanda:** EXCLUSIVA para produtos simples/unitários (`!product.isComposite`).
  - **Produtos Compostos (`product.isComposite === true`):** Permanecem com `stockDeducted = false` na comanda e têm seus componentes baixados exclusivamente no checkout (onde os modificadores são enviados e processados).

### 1.2. Contrato de Checkout Estrito: `comandaId` + `extraItems`
- **Diagnóstico Confirmado:** Comparar listas consolidadas no backend gera ambiguidade (preços promocionais, duplicatas, modificadores).
- **Regra Definitiva:**
  - O endpoint de checkout receberá explicitamente:
    ```json
    {
      "comandaId": "uuid-da-comanda",
      "extraItems": [
        {
          "productId": "uuid-do-produto-balcao",
          "quantity": 1,
          "priceUnit": 5.00
        }
      ],
      "payments": [...],
      "cashRegisterId": "...",
      ...
    }
    ```
  - Os itens da comanda consumidos vêm **estrita e exclusivamente do banco de dados** (`comanda.items`).
  - Itens adicionados no balcão no momento do pagamento viajam isolados em `extraItems`.
  - Se o operador quiser remover um item da comanda antes do pagamento, **deve executar a remoção na própria comanda** (`DELETE /v1/comandas/:id/items/:itemId`), garantindo o estorno no estoque e no total da comanda antes de abrir o checkout.

### 1.3. Custeio PEPS/FIFO: Definição Conceitual Exata
- **Conceito:** A baixa no lançamento da comanda resolve a **disponibilidade física imediata** no salão.
- A apropriação dos lotes e do custo unitário (`StockLotConsumption` e `priceCost` do `SaleItem`) é caracterizada tecnicamente como **Custeio no Fechamento** (lotes FIFO atribuídos no momento do pagamento).
- Essa separação viabiliza o estorno harmônico via `cancelSale` sem inflar a complexidade do modelo relacional nesta fase.

### 1.4. Regra Anti-Duplicação de Logs de Inventário
- Para itens com `stockDeducted = true`:
  - O checkout **NÃO** decrementa `product.stock`.
  - O checkout **NÃO** gera um segundo `InventoryLog` de saída (`OUT`/`SALE`).
  - O checkout apenas gera o registro da venda (`Sale`, `SaleItem`), o snapshot fiscal e consome os lotes FIFO (`StockLotConsumption`).
- Para itens com `stockDeducted = false` (comandas legadas ou compostos) e para `extraItems`:
  - O checkout decrementa `product.stock`, gera o `InventoryLog` (`type: 'SALE'`) e consome os lotes FIFO normalmente.

### 1.5. Regras Estritas de Cancelamento de Comanda
- O cancelamento (`DELETE /v1/comandas/:id` ou `cancelComanda`) só é permitido para comandas com status `'open'` ou `'waiting_payment'`.
- Apenas itens com `stockDeducted === true` sofrem estorno de `product.stock` (`increment`) e geram `InventoryLog` (`type: 'IN'`, `origin: 'COMANDA'`).
- Comandas já fechadas ou já canceladas rejeitam a operação com `BadRequestException`.

---

## 2. Desenho Técnico Detalhado dos Componentes

### 2.1. Prisma Schema (`backend/prisma/schema.prisma`)
Adicionar no modelo `ComandaItem`:
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
  stockDeducted Boolean  @default(false) // <-- Rastreabilidade de baixa física
  createdById   String?
  createdBy     Operator? @relation("ComandaItemCreatedBy", fields: [createdById], references: [id])
  createdAt     DateTime @default(now())

  @@index([comandaId])
  @@index([createdById])
  @@map("comanda_items")
}
```
*(Lembrando: atualização nos bancos dos tenants pelo botão "Atualizar Bancos" no Sys-Init).*

---

### 2.2. Módulo de Comandas (`ComandasService`)

#### `addItems(comandaId, items)`:
1. Validar se comanda existe e está com `status === 'open'`.
2. Em `prisma.$transaction`:
   - Ler `tenantSettings.allowNegativeStock`.
   - Para cada item:
     - Buscar produto no banco.
     - Se `!product.isComposite`:
       - Se `!allowNegativeStock` e `product.stock < quantity`, abortar com erro amigável de estoque insuficiente.
       - Atualizar produto: `stock: { decrement: quantity }`.
       - Criar `InventoryLog`:
         - `productId: product.id`
         - `type: 'OUT'`
         - `origin: 'COMANDA'`
         - `reason: 'Lançamento na Comanda #' + comanda.number`
         - `referenceId: comanda.id`
       - Criar `ComandaItem` com `stockDeducted: true`.
     - Se `product.isComposite`:
       - Criar `ComandaItem` com `stockDeducted: false` (baixa postergada para o checkout).
   - Recalcular total da comanda.
3. Após commit:
   - `this.productsService.invalidateCache(tenantId)`
   - `this.integrationsService.syncProductStock(tenantId, simpleProductIds)`

#### `removeItem(comandaId, itemId)`:
1. Validar se comanda está com `status === 'open'`.
2. Em `prisma.$transaction`:
   - Buscar item da comanda.
   - Se `item.stockDeducted === true`:
     - Atualizar produto: `stock: { increment: item.quantity }`.
     - Criar `InventoryLog` (`type: 'IN'`, `origin: 'COMANDA'`, `reason: 'Remoção de item da Comanda #' + comanda.number`, `referenceId: comanda.id`).
   - Deletar `ComandaItem`.
   - Recalcular total da comanda.
3. Após commit:
   - `this.productsService.invalidateCache(tenantId)`
   - `this.integrationsService.syncProductStock(tenantId, [item.productId])`

#### `cancelComanda(comandaId)`:
1. Validar se comanda existe e tem `status in ['open', 'waiting_payment']`. Se não, lançar `BadRequestException`.
2. Em `prisma.$transaction`:
   - Para cada item da comanda com `stockDeducted === true`:
     - Atualizar produto: `stock: { increment: item.quantity }`.
     - Criar `InventoryLog` (`type: 'IN'`, `origin: 'COMANDA'`, `reason: 'Cancelamento da Comanda #' + comanda.number`, `referenceId: comanda.id`).
   - Atualizar comanda: `status: 'cancelled'`.
3. Após commit:
   - Invalidate cache + sync integrations.

---

### 2.3. Módulo de Vendas (`SalesService.checkout`)

Quando o payload contiver `comandaId`:
1. Buscar a comanda no banco via `tx.comanda.findUnique({ where: { id: comandaId }, include: { items: { include: { product: true } } } })`.
2. Validar que o status é `'open'` ou `'waiting_payment'`.
3. Montar a lista total de itens da venda:
   - Itens da comanda (lidos diretamente do banco).
   - Itens extras de balcão (`data.extraItems || []`).
4. Para cada item da comanda:
   - Se `stockDeducted === true`:
     - **NÃO** altera `product.stock`.
     - **NÃO** cria `InventoryLog`.
     - Executa `consumeLotsFIFO` para apurar o custo (`priceCost`) e criar `StockLotConsumption`.
   - Se `stockDeducted === false` (comandas legadas ou produtos compostos):
     - Executa o fluxo padrão: valida estoque, decrementa `product.stock`, cria `InventoryLog` (`SALE`) e consome lotes FIFO.
5. Para cada item em `extraItems`:
   - Executa o fluxo padrão normal de venda PDV.
6. Criação de `Sale`, `SaleItem`, `Payment` normalmente.
7. Fechamento atômico da comanda: `tx.comanda.update({ where: { id: comandaId }, data: { status: 'closed', saleId: sale.id } })`.
8. Invalidação de cache e sincronização com integrações externas para todos os produtos envolvidos.

---

### 2.4. Frontend (`PaymentModal.tsx` & Fluxo do PDV)

1. Quando uma comanda está ativa (`activeComandaId`):
   - Os itens vindos da comanda são marcados no carrinho como pertencentes à comanda.
   - Qualquer item adicional bipado/adicionado no caixa entra no array `extraItems`.
   - Se o operador tentar remover um item da comanda no carrinho, o sistema exibe aviso orientando a remoção pela comanda ou dispara a exclusão direta na comanda com o devido estorno.
2. No envio do checkout (`handleConfirm`):
   - Se houver `activeComandaId`, envia:
     `comandaId: activeComandaId`,
     `extraItems: [ ...itensExtrasDoBalcao ]`.

---

Este documento reflete o alinhamento 100% final e detalhado. Aguardamos o sinal verde final para início da implementação.
