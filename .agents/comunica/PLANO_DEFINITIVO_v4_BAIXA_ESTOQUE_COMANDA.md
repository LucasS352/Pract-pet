# Plano Definitivo v4: Baixa de Estoque em Comandas com Suporte a Compostos

**Data:** 06/09/2026 | **Status:** AGUARDANDO SINAL VERDE FINAL  
**Autores:** Antigravity (Dev) + Codex (Revisão) + Lucas (Lead)

---

## 1. Correções v4 (Codex — Revisão Final)

| # | Problema identificado | Decisão |
|---|---|---|
| 1 | Frontend não deve enviar `componentProductId`, `name`, `quantity` ou `priceAdjustment` | Frontend envia apenas `{ optionId }`. Backend busca e valida `ProductModifierOption` pelo id e extrai todos os dados autoritativos |
| 2 | `ComandaItemModifier.quantity` tinha semântica ambígua | Campo renomeado para `consumedQuantity` = valor já calculado (`itemQty × option.quantity / volumeCapacity ∥ 1`). Usado diretamente em baixa, estorno e FIFO. |
| 3 | Preço do composto não estava sendo calculado no backend | Backend calcula `unitPrice = product.priceSell + Σ(option.priceAdjustment)` e salva em `ComandaItem.unitPrice/totalPrice` |
| 4 | `CompositeModifierModal` suporta apenas 1 seleção por grupo (radio) | Modal mantido como está. Restrição de escopo: a API `addItems` rejeita com `BadRequestException` grupos com `minSelected ≠ 1 ∥ maxSelected ≠ 1`. Quando a UI de comandas for expandida para suportar múltiplas seleções, o modal e o backend serão atualizados juntos. |

---

## 2. Modelo de Dados (Migration via Sys-Init)

### `ComandaItem` — campo novo
```prisma
stockDeducted Boolean              @default(false)
modifiers     ComandaItemModifier[]
```

### `ComandaItemModifier` — modelo novo
```prisma
model ComandaItemModifier {
  id                 String      @id @default(uuid())
  comandaItemId      String
  comandaItem        ComandaItem @relation(fields: [comandaItemId], references: [id], onDelete: Cascade)
  
  // Snapshot imutável do momento do lançamento (não reflete alterações futuras no produto)
  optionId           String      // ID da ProductModifierOption usada (auditoria)
  componentProductId String
  componentProduct   Product     @relation("ComandaItemModifierComponent", fields: [componentProductId], references: [id])
  name               String      // Snapshot do nome da opção
  consumedQuantity   Decimal     @db.Decimal(10, 3)  // Já calculado: itemQty × (option.quantity / volumeCapacity ∥ 1)
  priceAdjustment    Decimal     @db.Decimal(10, 2)   // Snapshot do ajuste de preço

  @@index([comandaItemId])
  @@map("comanda_item_modifiers")
}
```

### Adição no modelo `Product`
```prisma
comandaItemModifiers ComandaItemModifier[] @relation("ComandaItemModifierComponent")
```

> **Regra do Projeto:** Nenhum comando Prisma no terminal. Após editar `schema.prisma`, o usuário clica em **"Atualizar Bancos"** no Sys-Init.

---

## 3. Contrato da API `POST /v1/comandas/:id/items`

### Payload enviado pelo frontend
```json
{
  "items": [
    {
      "productId": "uuid-produto-simples",
      "quantity": 2,
      "notes": "Gelado"
    },
    {
      "productId": "uuid-produto-composto",
      "quantity": 1,
      "modifiers": [
        { "optionId": "uuid-da-option-grupo-1" },
        { "optionId": "uuid-da-option-grupo-2" }
      ]
    }
  ]
}
```

> O backend é a única fonte dos campos `componentProductId`, `name`, `quantity`, `priceAdjustment` e `consumedQuantity`. O frontend envia apenas `optionId`.

---

## 4. Backend — Lógica detalhada por operação

### 4.1. `ComandasService.addItems`

```
VALIDAÇÕES INICIAIS (fora da transação):
  - Comanda existe e status === 'open'
  - Ler tenantSettings.allowNegativeStock

Para cada item do payload:
  - Buscar produto com:
      include: { modifierGroups: { include: { options: { include: { componentProduct: true } } } } }

  ── Se produto SIMPLES (!isComposite) ──────────────────────────────
  
  1. Decremento atômico:
       result = tx.product.updateMany({
         where: { id: productId, stock: { gte: qty } },
         data:  { stock: { decrement: qty } }
       })
       if result.count === 0 && !allowNegativeStock:
         throw BadRequestException("Estoque insuficiente para: ${product.name}")
       if allowNegativeStock && result.count === 0:
         tx.product.update({ where: { id: productId }, data: { stock: { decrement: qty } } })
  
  2. Criar InventoryLog { type: 'OUT', origin: 'COMANDA', reason, referenceId: comanda.id }
  
  3. Criar ComandaItem { stockDeducted: true }

  ── Se produto COMPOSTO (isComposite) ─────────────────────────────
  
  1. Validar que item.modifiers não está vazio
  
  2. Para cada grupo do produto (product.modifierGroups):
       - Verificar que group.minSelected === 1 && group.maxSelected === 1
         (Caso contrário: BadRequestException — "Grupo '${group.name}' requer múltiplas seleções.
          Compostos com seleção múltipla ainda não são suportados em comandas.")
       - Verificar que o payload enviou uma opção para este grupo

  3. Para cada { optionId } do payload:
       - Buscar ProductModifierOption por ID dentro dos grupos do produto
         (Se não encontrado: BadRequestException — "Opção inválida para o produto ${product.name}")
       - Extrair do banco: option.componentProductId, option.name, option.quantity, option.priceAdjustment
       - componentProduct = opção.componentProduct (já incluído no include)
       - consumedQuantity = qty × (option.quantity / (componentProduct.volumeCapacity ∥ 1))

       - Decremento atômico do ingrediente:
           result = tx.product.updateMany({
             where: { id: componentProduct.id, stock: { gte: consumedQuantity } },
             data:  { stock: { decrement: consumedQuantity } }
           })
           Tratar allowNegativeStock da mesma forma que produto simples
       
       - Criar InventoryLog { type: 'OUT', origin: 'COMANDA', productId: componentProduct.id }
  
  4. Calcular unitPrice do composto:
       unitPrice = product.priceSell + Σ(option.priceAdjustment de cada optionId)
       totalPrice = unitPrice × qty
  
  5. Criar ComandaItem {
       productId, quantity, unitPrice, totalPrice,
       stockDeducted: true,
       modifiers: {
         create: [
           { optionId, componentProductId, name, consumedQuantity, priceAdjustment }
           // consumedQuantity já calculado, salvo diretamente
         ]
       }
     }

PASSO FINAL: Recalcular total da comanda
PÓS-COMMIT: productsService.invalidateCache + integrationsService.syncProductStock
```

### 4.2. `ComandasService.removeItem`

```
1. Buscar item por { id: itemId, comandaId: comandaId }
   (dupla validação — protege contra ID indevido de outra comanda)
   include: { modifiers: true }

2. Se item não encontrado: NotFoundException

3. prisma.$transaction:
   Se item.stockDeducted === true:
     Se produto composto (item.modifiers.length > 0):
       Para cada modifier:
         tx.product.update({ id: modifier.componentProductId, data: { stock: { increment: modifier.consumedQuantity } } })
         Criar InventoryLog { type: 'IN', origin: 'COMANDA', productId: modifier.componentProductId }
     Senão (produto simples):
       tx.product.update({ id: item.productId, data: { stock: { increment: item.quantity } } })
       Criar InventoryLog { type: 'IN', origin: 'COMANDA', productId: item.productId }
   
   Deletar ComandaItem (ComandaItemModifier deletados via onDelete: Cascade)
   Recalcular total da comanda

PÓS-COMMIT: invalidar cache + sync integrações
```

### 4.3. `ComandasService.cancelComanda`

```
1. Buscar comanda com { include: { items: { include: { modifiers: true } } } }
2. Se status ∉ ['open', 'waiting_payment']: BadRequestException
3. prisma.$transaction:
   Para cada item com stockDeducted === true:
     Aplicar mesma lógica de removeItem (simples OU composto via modifiers.consumedQuantity)
   comanda.update({ status: 'cancelled' })
PÓS-COMMIT: invalidar cache + sync integrações
```

### 4.4. `SalesService.checkout` (quando `comandaId` presente)

```
1. Buscar comanda: { include: { items: { include: { modifiers: { include: { componentProduct: true } }, product: { include: { modifierGroups: { include: { options: true } } } } } } } }
2. Validar status in ['open', 'waiting_payment']

3. Para cada item da comanda:
   
   a) stockDeducted === false && isComposite === true:
      → BadRequestException: "Item composto '${product.name}' não possui ingredientes registrados.
         Remova-o da comanda e relance selecionando os ingredientes."
   
   b) stockDeducted === true:
      → NÃO decrementa product.stock
      → NÃO cria InventoryLog de saída
      → consumeLotsFIFO nos produtos afetados:
          - Produto simples: consumeLotsFIFO(product.id, item.quantity)
          - Produto composto: para cada modifier, consumeLotsFIFO(modifier.componentProductId, modifier.consumedQuantity)
      → Criar SaleItem com unitPrice = item.unitPrice (snapshot da comanda)
      → Criar SaleItemModifier para cada modifier (usando dados do snapshot)
      → Vincular StockLotConsumption ao SaleItem
   
   c) stockDeducted === false && !isComposite (simples legado):
      → Fluxo normal: decrement stock, InventoryLog 'SALE', consumeLotsFIFO

4. Para cada item em data.extraItems:
   → Fluxo padrão de balcão

5. Fechamento atômico na mesma tx:
   tx.comanda.update({ status: 'closed', saleId: sale.id })

PÓS-COMMIT: invalidar cache + sync integrações
```

---

## 5. Frontend

### 5.1. `GarcomPage.tsx` e `ComandasPage.tsx`
- Importar `CompositeModifierModal` (já existe).
- Ao clicar em produto composto: abrir o modal.
- No `onConfirm`, coletar apenas os `{ optionId }` de cada seleção e enviar no payload.
- O modal já calcula o `finalPrice` para exibição; o preço real vem calculado pelo backend.

### 5.2. `PaymentModal.tsx`
- Enviar `{ comandaId, extraItems: [...] }` no checkout.
- Remover chamada posterior a `/v1/comandas/:id/close`.

---

## 6. Verificação

| Cenário | Validação |
|---|---|
| **Produto simples — lançamento** | `stock` baixa via `updateMany` atômico; `InventoryLog OUT`; `stockDeducted: true` |
| **Produto composto — lançamento** | `optionId` validado no banco; ingredientes baixados via `consumedQuantity` direto; snapshot em `ComandaItemModifier`; preço calculado no backend |
| **Race condition** | Duas requisições simultâneas para o último item: `updateMany count === 0` → uma retorna erro claro |
| **Remoção simples** | Estoque restaurado; `InventoryLog IN` |
| **Remoção composto** | Cada ingrediente restaurado via `modifier.consumedQuantity` (snapshot — não recalcula) |
| **Cancelamento** | Só em `open`/`waiting_payment`; apenas `stockDeducted: true` estornados |
| **Checkout comanda** | Sem dupla baixa; FIFO consumido; comanda fechada atomicamente |
| **Composto legado sem modifiers** | `400 BadRequestException` pedindo resolução manual |
| **Grupo multi-seleção** | `400 BadRequestException` com mensagem clara — fora do escopo desta fase |
