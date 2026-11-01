# Plano Definitivo v3: Baixa de Estoque em Comandas com Suporte a Compostos

**Data:** 06/09/2026  
**Status:** AGUARDANDO SINAL VERDE FINAL  
**Consenso:** Antigravity (Dev) + Codex (Revisão) + Lucas (Lead)

---

## 1. Escopo Expandido e Justificativa

Produto composto lançado em comanda é consumo real — ignorá-lo geraria furo de estoque nos ingredientes. A solução correta é persistir a composição escolhida (`ComandaItemModifier`) no ato do lançamento, usando-a como snapshot imutável para baixa, estorno e custeio FIFO no checkout.

O `CompositeModifierModal` já existe no `PosPage.tsx` com toda a lógica de seleção de grupos/opções. Será reutilizado (ou extraído como componente compartilhado) para o `GarcomPage.tsx` e `ComandasPage.tsx`.

---

## 2. Decisões Finais Incorporadas (Correções do Codex)

| # | Ponto | Decisão |
|---|---|---|
| 1 | Compostos na comanda | Suportados com `ComandaItemModifier` (snapshot imutável dos componentes escolhidos) |
| 2 | Baixa de compostos na comanda | Baixar ingredientes imediatamente via snapshot; `stockDeducted = true` no `ComandaItem` |
| 3 | Decremento atômico | `updateMany` com condição `stock >= quantidade` para evitar race condition entre comandas simultâneas |
| 4 | Segurança de `removeItem` | Buscar item por `{ id: itemId, comandaId: comandaId }` — nunca por `id` isolado |
| 5 | Compostos sem `ComandaItemModifier` (legado) | **Proibidos de fechar silenciosamente.** Checkout exige resolução manual: remover e relançar o item na comanda com a nova seleção |
| 6 | Custeio FIFO | "Custeio no Fechamento" — FIFO atribuído no pagamento, não no momento do consumo |
| 7 | Anti-duplicação de logs | Itens com `stockDeducted = true` não geram novo `InventoryLog OUT` no checkout |
| 8 | Cancelamento seguro | Só em `open`/`waiting_payment`; estorna apenas `stockDeducted === true`; estorna ingredientes via `ComandaItemModifier` |

---

## 3. Modelo de Dados

### 3.1. `ComandaItem` — Campo Novo (Migration via Sys-Init)
```prisma
model ComandaItem {
  id            String    @id @default(uuid())
  comandaId     String
  comanda       Comanda   @relation(fields: [comandaId], references: [id], onDelete: Cascade)
  productId     String
  product       Product   @relation(fields: [productId], references: [id])
  quantity      Decimal   @db.Decimal(10, 3)
  unitPrice     Decimal   @db.Decimal(10, 2)
  totalPrice    Decimal   @db.Decimal(10, 2)
  notes         String?
  stockDeducted Boolean   @default(false)  // ← NOVO
  createdById   String?
  createdBy     Operator? @relation("ComandaItemCreatedBy", fields: [createdById], references: [id])
  createdAt     DateTime  @default(now())

  modifiers     ComandaItemModifier[]  // ← NOVO RELACIONAMENTO

  @@index([comandaId])
  @@index([createdById])
  @@map("comanda_items")
}
```

### 3.2. `ComandaItemModifier` — Modelo Novo (Migration via Sys-Init)
```prisma
model ComandaItemModifier {
  id                 String      @id @default(uuid())
  comandaItemId      String
  comandaItem        ComandaItem @relation(fields: [comandaItemId], references: [id], onDelete: Cascade)
  componentProductId String
  componentProduct   Product     @relation("ComandaItemModifierComponent", fields: [componentProductId], references: [id])
  name               String      // Snapshot do nome no momento do lançamento
  quantity           Decimal     @db.Decimal(10, 3)  // Quantidade efetivamente consumida do ingrediente
  priceAdjustment    Decimal     @db.Decimal(10, 2)

  @@index([comandaItemId])
  @@map("comanda_item_modifiers")
}
```

**Importante:** A relação `ComandaItemModifier → Product` precisa ser adicionada como novo `@@relation` no modelo `Product` também:
```prisma
  comandaItemModifiers ComandaItemModifier[] @relation("ComandaItemModifierComponent")
```

> **Regra do Projeto:** Após editar `schema.prisma`, o usuário clica em "Atualizar Bancos" no painel Sys-Init. Nenhum comando Prisma é executado no terminal.

---

## 4. Backend — Mudanças por Serviço

### 4.1. `ComandasModule` (`comandas.module.ts`)
- Importar `ProductsModule` e `IntegrationsModule` para disponibilizar `ProductsService` e `IntegrationsService` via injeção de dependência.

---

### 4.2. `ComandasService` (`comandas.service.ts`)

#### `addItems(comandaId, items)`
```
PASSO 1 — Validar comanda (status === 'open')
PASSO 2 — Ler tenantSettings.allowNegativeStock
PASSO 3 — prisma.$transaction:
  Para cada item do array:
    a) Buscar produto com { modifierGroups.options }
    b) Se produto não existe → BadRequestException
    
    Se produto SIMPLES (!isComposite):
      - Decremento atômico:
          updateMany({ where: { id, stock: { gte: qty } }, data: { stock: { decrement: qty } } })
          if count === 0 e !allowNegativeStock → BadRequestException estoque insuficiente
          if allowNegativeStock → update direto com decrement
      - Criar InventoryLog { type: 'OUT', origin: 'COMANDA', reason: 'Lançamento Comanda #X', referenceId: comanda.id }
      - Criar ComandaItem { stockDeducted: true }
    
    Se produto COMPOSTO (isComposite):
      - Validar que item.modifiers foi enviado e não está vazio
      - Para cada modificador (componentProductId + quantity):
          fractionToDecrement = item.quantity * (modifier.quantity / componentProduct.volumeCapacity || 1)
          Decremento atômico no ingrediente:
            updateMany({ where: { id: componentProductId, stock: { gte: fractionToDecrement } }, ... })
            Tratar allowNegativeStock da mesma forma
          Criar InventoryLog { type: 'OUT', origin: 'COMANDA', productId: componentProductId }
      - Criar ComandaItem { stockDeducted: true }
      - Criar ComandaItemModifier[] (snapshot imutável dos componentes e quantidades)
PASSO 4 — Recalcular total da comanda
PASSO 5 — Pós-commit:
  productsService.invalidateCache(tenantId)
  integrationsService.syncProductStock(tenantId, todosOsProductIds)
```

#### `removeItem(comandaId, itemId)`
```
PASSO 1 — Validar comanda (status === 'open')
PASSO 2 — Buscar item com: { where: { id: itemId, comandaId: comandaId }, include: { modifiers: true, product: true } }
          (garantir que o item pertence à comanda — proteção contra ID indevido)
PASSO 3 — prisma.$transaction:
  Se item.stockDeducted === true:
    Se item.product.isComposite:
      Para cada modifier em item.modifiers:
        fractionToRestore = item.quantity * (modifier.quantity / componentProduct.volumeCapacity || 1)
        product.update({ id: modifier.componentProductId, data: { stock: { increment: fractionToRestore } } })
        Criar InventoryLog { type: 'IN', origin: 'COMANDA', productId: modifier.componentProductId }
    Se produto SIMPLES:
      product.update({ id: item.productId, data: { stock: { increment: item.quantity } } })
      Criar InventoryLog { type: 'IN', origin: 'COMANDA', productId: item.productId }
  Deletar ComandaItem (modifiers deletados em cascade)
  Recalcular total
PASSO 4 — Pós-commit: invalidar cache + sync integrações
```

#### `cancelComanda(comandaId)`
```
PASSO 1 — Buscar comanda com { include: { items: { include: { modifiers: true, product: true } } } }
PASSO 2 — Validar status in ['open', 'waiting_payment']
          Se status === 'closed' ou 'cancelled' → BadRequestException
PASSO 3 — prisma.$transaction:
  Para cada item com stockDeducted === true:
    Seguir a mesma lógica de removeItem (simples: incrementar product.stock; composto: incrementar cada ingrediente via modifiers)
    Criar InventoryLog { type: 'IN', origin: 'COMANDA' }
  comanda.update({ status: 'cancelled' })
PASSO 4 — Pós-commit: invalidar cache + sync integrações
```

---

### 4.3. `SalesService.checkout` (`sales.service.ts`)

Adicionar suporte a `comandaId` e `extraItems` no payload:

```
Se data.comandaId está presente:
  1) Buscar a comanda no banco:
     tx.comanda.findUnique({ where: { id: data.comandaId }, include: { items: { include: { modifiers: true, product: { include: { modifierGroups: { include: { options: true } } } } } } } })
  
  2) Validar status in ['open', 'waiting_payment'] → BadRequestException caso contrário
  
  3) Para cada item da comanda:
     a) Se stockDeducted === false E isComposite === true:
        → BadRequestException: "Item composto '${item.product.name}' foi lançado antes do sistema suportar compostos em comanda.
           Remova o item e relance-o para prosseguir."
     
     b) Se stockDeducted === true:
        → NÃO decrementa product.stock
        → NÃO cria InventoryLog de saída
        → Executa consumeLotsFIFO nos produtos afetados (simples: product.id; composto: cada modifier.componentProductId)
           para atribuição de custo no fechamento (StockLotConsumption vinculado ao SaleItem)
     
     c) Se stockDeducted === false (simples legado):
        → Executa fluxo padrão de venda: valida estoque, decrementa, cria InventoryLog 'SALE', consome FIFO
  
  4) Para cada item em data.extraItems:
     → Executa fluxo normal de venda balcão (sem nenhuma distinção)
  
  5) Fechar comanda atomicamente: 
     tx.comanda.update({ where: { id: data.comandaId }, data: { status: 'closed', saleId: sale.id } })
  
  6) Pós-commit: invalidar cache + sync integrações (todos os produtos da comanda + extraItems)
```

---

## 5. Frontend — Mudanças por Componente

### 5.1. `GarcomPage.tsx`
- Importar e reutilizar `CompositeModifierModal` (já existe em `components/CompositeModifierModal.tsx`).
- Adicionar estado `compositeProductForComanda` e `pendingComandaItemQty`.
- Ao clicar em um produto composto no painel "Adicionar Item":
  - Abrir `CompositeModifierModal` com os grupos/opções do produto.
  - No `onConfirm`, enviar no payload do `POST /v1/comandas/:id/items`:
    ```json
    {
      "items": [{
        "productId": "...",
        "quantity": 1,
        "modifiers": [
          { "componentProductId": "...", "name": "TNT 355ml", "quantity": 100, "priceAdjustment": 0 }
        ]
      }]
    }
    ```

### 5.2. `ComandasPage.tsx`
- Mesma lógica do `GarcomPage.tsx` para suporte a compostos.

### 5.3. `PaymentModal.tsx`
- Quando `activeComandaId` está presente:
  - Enviar `comandaId: activeComandaId` e `extraItems: [...]` (itens do carrinho que NÃO pertencem à comanda).
  - Remover a chamada redundante posterior a `/v1/comandas/:id/close` (pois o backend fecha atomicamente no checkout).

---

## 6. Regra para Comandas Antigas com Compostos sem Modificadores

Ao tentar fechar uma comanda que possui `ComandaItem` com `isComposite = true` e `stockDeducted = false` (e portanto sem `modifiers`), o sistema retorna:

```
HTTP 400 — BadRequestException:
"O item composto '${item.product.name}' foi lançado antes do suporte a compostos em comandas.
Para prosseguir, remova este item da comanda e relance-o selecionando os ingredientes."
```

---

## 7. Verificação

1. **Produto simples em comanda:** `product.stock` baixa imediatamente via `updateMany` atômico; `InventoryLog OUT COMANDA` gravado; `stockDeducted: true`.
2. **Produto composto em comanda:** Garçom escolhe os ingredientes no modal; ingredientes baixam atomicamente; `ComandaItemModifier` gravado; `stockDeducted: true` no item pai.
3. **Remoção de item simples:** Estoque volta imediatamente; `InventoryLog IN COMANDA` gravado.
4. **Remoção de item composto:** Estoque de cada ingrediente restaurado via snapshot de `ComandaItemModifier`.
5. **Cancelamento de comanda:** Todos os itens `stockDeducted: true` (simples e compostos) são estornados; comandas fechadas/canceladas rejeitam a operação.
6. **Checkout com comanda + extras de balcão:** Itens da comanda `stockDeducted: true` não geram segunda baixa; `extraItems` seguem o fluxo normal; lotes FIFO consumidos para custeio; comanda fechada atomicamente na mesma transação.
7. **Comanda com composto legado:** Checkout retorna 400 pedindo resolução manual.
8. **Estoque simultâneo (Race Condition):** `updateMany` com `stock >= qty` garante atomicidade; duas comandas simultâneas para o último item: uma sucede, a outra falha com erro claro de estoque insuficiente.
