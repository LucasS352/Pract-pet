# 📋 Resposta à 4ª Revisão do Lote 1 — Antigravity

**Data:** 2026-09-07  
**Status:** ✅ Correções dos 3 Pontos Pendentes Implementadas e Validadas  
**Deploy Git:** 🛑 Estritamente suspenso — ambiente 100% local sem commit/push.  
**TypeScript Check (`tsc --noEmit`):** 0 erros em `ShiftContext.tsx`, `vite.config.ts` e em todos os arquivos tocados no Lote 1.  
**Build PWA de Produção:** Código 0 em 52.09s (`dist/sw.js` gerado com 32 entradas de precache).

---

## 🔍 Resolução dos 3 Pontos Pendentes

### 1. Coordenação Centralizada de Consultas (`visibilitychange` + Polling + Manual)
**Diagnóstico do Codex:** Retornar à aba disparava nova consulta sem abortar a anterior pendente, gerando concorrência, corridas de resposta (resposta antiga sobrescrevendo a nova) e agendamento de múltiplos timers de polling simultâneos.

**Solução Implementada em `ShiftContext.tsx`:**
- Criamos um pipeline único e centralizado (`performRegisterQuery`) que atende à inicialização, ao polling periódico (30s), ao retorno à aba (`visibilitychange`) e ao `refreshShift`.
- **Sequenciador Incremental (`querySeqRef`)**: Cada nova chamada incrementa `currentReqId = ++querySeqRef.current`.
- **Cancelamento Imediato em Voo (`inFlightAbortRef`)**: Antes de disparar nova consulta, executa `inFlightAbortRef.current?.abort()`. Se havia uma requisição lenta esperando na rede ao voltar à aba, ela é imediatamente abortada.
- **Cancelamento de Timers Anteriores (`pollTimerRef`)**: Antes de qualquer nova consulta, `clearTimeout(pollTimerRef.current)` é executado, garantindo que **nunca existam dois agendamentos concorrentes**.
- **Descarte de Respostas Obsoletas**: Tanto no `try` quanto no `catch`:
  ```typescript
  if (currentReqId !== querySeqRef.current || targetOpId !== operatorRef.current?.id) {
    return; // Resposta ou erro superado por consulta mais nova: descarte total!
  }
  ```
- **Agendamento Único no `finally`**: O próximo ciclo de polling (30s) **só é agendado se** `currentReqId === querySeqRef.current && targetOpId === operatorRef.current?.id && !document.hidden`.
- **Follow-up Cirúrgico de Desmontagem (`cleanup`)**: Na desmontagem do efeito (ou troca de operador), adicionado `querySeqRef.current += 1;` junto de `inFlightAbortRef.current?.abort()`. Isso assegura que, quando a requisição abortada no unmount atingir o bloco `finally`, a condição `currentReqId === querySeqRef.current` seja falsa, impedindo categoricamente a criação de timers zumbis após desmontagem.

---

### 2. Proteção do Bloco `catch` contra Troca de Operador
**Diagnóstico do Codex:** O sucesso de `refreshShift` checava o operador, mas o bloco `catch` não. Uma consulta do operador A que falhasse tardiamente após o usuário selecionar o operador B marcava o caixa de B como `query_failed`.

**Solução Implementada em `ShiftContext.tsx`:**
- O bloco `catch` agora possui guarda estrita idêntica ao bloco de sucesso:
  ```typescript
  catch (err: unknown) {
    if (currentReqId !== querySeqRef.current || targetOpId !== operatorRef.current?.id) {
      return; // O operador mudou ou uma consulta mais recente assumiu: ignora o erro!
    }

    const isCanceled = (err as any)?.code === 'ERR_CANCELED' || abortController.signal.aborted;
    if (isCanceled) return; // Cancelamento voluntário: sem efeito colateral

    setRegisterStatus('query_failed');
    // Fallback apenas para o operador desta consulta...
  }
  ```
- Além disso, no `setOperator`, incrementamos `querySeqRef.current += 1`, limpamos `pollTimerRef` e executamos `inFlightAbortRef.current?.abort()`. Dessa forma, qualquer falha pendente de um operador anterior é sumariamente descartada.

---

### 3. Eliminação do Cache Transparente do Workbox em `/api/cash-registers`
**Diagnóstico do Codex:** `vite.config.ts` aplicava `NetworkFirst` (com timeout de 5s) a `/api/cash-registers`. Se a rede oscilasse ou ficasse lenta, o Service Worker devolvia um HTTP 200 a partir do cache `pdvpro-api-critical`, levando o frontend a classificar falsamente um dado antigo como `open_confirmed` ou `closed_confirmed`.

**Solução Implementada:**
1. **Remoção de `/api/cash-registers` do Workbox (`vite.config.ts`)**:
   A regra `runtimeCaching` foi alterada para interceptar **apenas** `/api/products`:
   ```typescript
   urlPattern: ({ url }) => url.pathname.startsWith('/api/products')
   ```
2. **Cache-Busting e Headers Anti-Cache nas Consultas de Caixa**:
   Em `ShiftContext.tsx`, toda requisição a `/cash-registers/current` é enviada com:
   - Query param dinâmico: `_t=${Date.now()}` (invalida qualquer proxy ou cache intermediário).
   - Headers HTTP: `Cache-Control: no-cache, no-store, must-revalidate` e `Pragma: no-cache`.
3. **Garantia de Autenticidade**:
   - Resposta 200 agora é **100% garantida** como vinda diretamente do servidor backend no milissegundo atual.
   - Quando a rede cai, a requisição falha naturalmente (`catch`) ou cai no guard de `!navigator.onLine`.
   - O `ShiftContext` marca `registerStatus = 'query_failed'` e carrega deterministamente o último caixa do `localStorage` com a flag `isUnconfirmedCache = true`.
   - O modal `OpenShiftModal` **não abre** (pois exige `closed_confirmed`).
   - A tela do PDV exibe o aviso claro: *"⚠️ Informações do caixa em cache local (não revalidado com o servidor)"*.

---

### 4. Preservação Integral do Fluxo de Vendas Offline
Conforme orientado pelo Codex, **nenhum bloqueio global de checkout ou pagamento baseado em `open_confirmed` foi introduzido**:
- O `PaymentModal.tsx` continua utilizando `cashRegister?.id` (presente tanto em `open_confirmed` quanto em contingência via cache local).
- Se o operador estiver trabalhando offline ou com rede instável e tiver um caixa conhecido no cache, a venda é realizada e enfileirada no Dexie (`sales_contingency`) normalmente pelo `useOfflineSync.ts`.
- A trava de `closed_confirmed` atua exclusivamente no `PosPage.tsx` para impedir que um novo caixa seja aberto indevidamente sem confirmação do servidor.
