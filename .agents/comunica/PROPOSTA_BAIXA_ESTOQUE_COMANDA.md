# Proposta Técnica: Baixa de Estoque Imediata no Módulo de Comandas

**Para:** Codex (Agente de Revisão e Análise Técnica) & Lucas (Dev Lead)  
**De:** Antigravity (Pair Programmer & Implementador)  
**Data:** 06/09/2026  
**Status:** Em Discussão / Análise Inicial (NENHUM CÓDIGO DA APLICAÇÃO FOI ALTERADO)  
**Assunto:** Baixa de estoque no momento da inserção do item na Comanda e mitigação de deduções duplicadas no checkout.

---

## 1. Contexto e Motivação do Negócio
Uma cliente/usuária do sistema 7Bar PDV relatou que, atualmente, ao lançar itens em uma Comanda/Mesa, o estoque físico dos produtos não é debitado imediatamente.

### O Problema Real:
No fluxo de bares e restaurantes, quando um garçom lança 3 cervejas ou uma porção em uma comanda:
1. O item já é retirado fisicamente do estoque/geladeira/cozinha e entregue à mesa para consumo imediato.
2. Se o estoque só for baixado no momento em que a mesa fecha a conta e paga no caixa (o que pode levar horas):
   - O saldo em estoque fica **inflado/desatualizado** no sistema.
   - Outro operador no balcão pode vender um produto que já foi consumido na mesa, gerando furo de estoque.
   - Os relatórios operacionais em tempo real não refletem a realidade do salão.

Portanto, **a baixa de estoque deve ocorrer no momento em que o item é adicionado à comanda**.

---

## 2. Diagnóstico do Fluxo Atual (As-Is)

### 2.1. Lançamento na Comanda (`ComandasService.addItems`):
- Cria registros na tabela `comanda_items` (`productId`, `quantity`, `unitPrice`, `totalPrice`).
- Recalcula o total da comanda (`comandas.total`).
- **NENHUMA movimentação de estoque é realizada** (`product.stock` não muda, nenhum `InventoryLog` é criado, nenhum lote FIFO é consumido).

### 2.2. Fechamento no Caixa (`PosPage.tsx` -> `PaymentModal.tsx` -> `SalesService.checkout`):
- O operador do caixa clica em "Cobrar Comanda".
- O frontend carrega todos os itens da comanda para o carrinho do PDV (`useCartStore`) e define `activeComandaId = comanda.id`.
- Ao confirmar o pagamento, o frontend envia uma requisição `POST /sales/checkout` contendo os itens do carrinho e os dados de pagamento.
- **`SalesService.checkout` executa:**
  1. Valida `allowNegativeStock`.
  2. Decrementa `product.stock` (ou produtos componentes no caso de compostos).
  3. Cria `InventoryLog` do tipo `SALE` (ou `OUT`).
  4. Consome lotes FIFO (`consumeLotsFIFO` decrementando `stockLot.remaining`).
  5. Cria registros em `Sale`, `SaleItem`, `Payment`, etc.
- Após o sucesso do checkout, o frontend faz uma segunda chamada `POST /v1/comandas/:id/close` com `{ saleId }` para marcar a comanda como `closed`.

---

## 3. O Dilema Central: O Risco da Dedução Duplicada (Double Deduction)

Se simplesmente adicionarmos a baixa de estoque em `ComandasService.addItems`:
1. O produto é baixado quando o garçom lança na mesa (-1 cerveja).
2. O cliente vai ao caixa pagar. O caixa finaliza a venda no PDV.
3. `SalesService.checkout` é executado e baixa o produto **NOVAMENTE** (-1 cerveja).
4. **Resultado: O estoque foi debitado 2 vezes para um único consumo!**

Além disso, existem outros cenários fundamentais:
- **E se um item for removido/cancelado da comanda** antes do fechamento? (`removeItem`)
- **E se a comanda inteira for cancelada?** (`cancelComanda`)
- **E se o cliente, ao pagar no caixa, pedir para adicionar um chiclete/item do balcão que NÃO estava na comanda?**
- **E como lidar com os lotes FIFO (`StockLot`) e relatórios de custo?**
- **E o que acontece se o operador estornar/cancelar uma venda (`cancelSale`) que veio de uma comanda?**
- **E as comandas que já estavam abertas antes da atualização ser implantada?**

---

## 4. Análise dos Cenários e Soluções Propostas

### Cenário 1: Inserção de Itens na Comanda (`addItems`)
- **Ação:**
  - Envolver todo o processo em `prisma.$transaction`.
  - Verificar configuração do tenant: `allowNegativeStock`. Se `false` e `product.stock < quantity`, abortar com erro `BadRequestException` ("Estoque insuficiente para o produto X").
  - Decrementar o saldo físico: `product.update({ where: { id }, data: { stock: { decrement: qty } } })`.
  - Criar `InventoryLog`:
    - `type: 'OUT'`
    - `origin: 'COMANDA'`
    - `reason: 'Lançamento na Comanda #${comanda.number}'`
    - `referenceId: comanda.id`
  - Se for produto composto (`isComposite`), aplicar a baixa proporcional nos ingredientes componentes.
  - Invalidar o cache de produtos (`productsService.invalidateCache(tenantId)`) para atualizar o PDV em tempo real.

### Cenário 2: Remoção/Cancelamento de Item da Comanda (`removeItem`)
- **Ação:**
  - Dentro de transação, buscar o item antes de deletar.
  - Recompor o saldo físico: `product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } })`.
  - Criar `InventoryLog`:
    - `type: 'IN'`
    - `origin: 'COMANDA'`
    - `reason: 'Remoção de item da Comanda #${comanda.number}'`
    - `referenceId: comanda.id`
  - Se composto, estornar ingredientes.
  - Deletar o `comandaItem` e recalcular o total da comanda.
  - Invalidar cache.

### Cenário 3: Cancelamento da Comanda Completa (`cancelComanda`)
- **Ação:**
  - Dentro de transação, iterar por todos os `items` da comanda aberta.
  - Recompor o estoque de cada produto lançado.
  - Registrar logs de inventário (`type: 'IN'`).
  - Atualizar status da comanda para `'cancelled'`.
  - Invalidar cache.

### Cenário 4: Fechamento no Caixa (Checkout) — Como Evitar Dupla Baixa
Existem duas abordagens possíveis para o checkout no caixa:

#### **Abordagem A (Integrada no Backend via `comandaId` no Checkout — Recomendada):**
1. O frontend envia no payload de `POST /sales/checkout`:
   ```json
   {
     "comandaId": "uuid-da-comanda",
     "items": [...],
     "payments": [...],
     "cashRegisterId": "..."
   }
   ```
2. No `SalesService.checkout`, dentro da transação `tx`:
   - Se `comandaId` foi informado, busca a comanda e seus itens no banco.
   - Identifica quais quantidades de cada produto já vieram da comanda (e portanto **já tiveram `product.stock` debitado**).
   - Para os itens da comanda: **NÃO decrementa `product.stock` novamente**.
   - Para itens extras (ex: um chiclete adicionado no balcão na hora de pagar): decrementa `product.stock` normalmente!
   - Para **TODOS** os itens da venda (para fins fiscais, PEPS e apuração de custo):
     - Executa o `consumeLotsFIFO` para calcular o `priceCost` do snapshot fiscal e atualizar `StockLot.remaining`.
     - Vincula os `StockLotConsumption` ao `SaleItem`.
   - Fecha a comanda atomicamente (`tx.comanda.update({ where: { id: comandaId }, data: { status: 'closed', saleId: sale.id } })`).
   - **Vantagem:** Operação 100% atômica (venda e fechamento da comanda no mesmo commit de banco); sem risco de descompasso de rede; trata itens mistos (comanda + balcão).

#### **Abordagem B (Flag explícita por item no payload):**
- O frontend envia em cada item `skipStockMovement: true`.
- **Desvantagem:** O backend fica vulnerável a manipulações ou bugs do frontend, e a chamada para fechar a comanda continua sendo feita separadamente após o checkout (se a internet oscilar entre os dois requests, a venda é feita mas a comanda continua aberta).

### Cenário 5: Estorno de Venda (`cancelSale`)
- Quando uma venda é cancelada no PDV (`sales.service.ts: cancelSale`):
  - O sistema já possui a lógica de devolver aos lotes e ao `product.stock` através de `item.lotConsumptions`.
  - Como a Abordagem A consome os lotes no checkout para registrar os custos e consumos fiscais da venda, o cancelamento da venda devolverá o estoque normalmente ao inventário!

### Cenário 6: Retrocompatibilidade com Comandas Abertas Anteriores
- Se houver comandas já abertas no momento da atualização cujos itens NÃO foram debitados previamente:
  - Como distinguir se o item da comanda já teve baixa ou não?
  - **Opção 1:** Adicionar um campo `stockDeducted Boolean @default(false)` no modelo `ComandaItem` em `schema.prisma`.
    - *Atenção à Regra de Negócio:* Alterações em `schema.prisma` exigem que o usuário clique em "Atualizar Bancos" no Sys-Init (não rodar migrations no terminal).
    - Se `stockDeducted === true`, o checkout não baixa novamente. Se `false`, o checkout baixa.
  - **Opção 2:** Tratar comandas criadas a partir do momento do deploy (ou verificar se existe `InventoryLog` vinculado ao `comandaId`).

---

## 5. Pontos para Avaliação e Opinião do Codex

Solicitamos ao Codex que avalie especificamente:
1. **Consumo de Lotes FIFO (`StockLot`):**
   - É melhor debitar apenas `product.stock` no momento do lançamento na comanda e deixar o consumo de `StockLot` para o checkout da venda (quando é gerado o `SaleItem` fiscal)?
   - Ou o lote deveria ser reservado/consumido já na comanda? (Lembrando que `StockLotConsumption` atualmente tem chave estrangeira obrigatória para `saleItemId`).
2. **Abordagem de Checkout (A vs B):**
   - A Abordagem A (passar `comandaId` no `sales/checkout` e resolver atomicamente a comanda e o estoque no backend) parece ser a mais sólida e resiliente a falhas de rede. O que você acha?
3. **Controle de Comandas Abertas (Flag `stockDeducted` vs outra estratégia):**
   - Vale a pena adicionar o campo `stockDeducted` no `ComandaItem` (com migration via Sys-Init) para garantir idempotência cirúrgica em transições e cancelamentos parciais?
4. **Produtos Compostos / Ficha Técnica:**
   - No momento do lançamento na comanda, se for produto composto, devemos debitar os ingredientes componentes com base na ficha técnica/adicionais?

---

*Aguardando parecer do Codex e validação do Lucas para prosseguirmos com o plano de implementação detalhado.*
