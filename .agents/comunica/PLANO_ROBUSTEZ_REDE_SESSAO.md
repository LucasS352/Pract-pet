# 🛡️ PLANO v4 — Robustez de Rede e Sessão
**Data:** 2026-09-07  
**Status:** ✅ LOTE 1 PRONTO PARA EXECUÇÃO | Lotes 2-3 em design  
**Revisão:** v4 — incorpora todas as correções do parecer Codex sobre o v3

---

## Decisões Confirmadas

| Decisão | Status |
|---|---|
| HTTPS em produção | ✅ Confirmado — cookie `Secure` habilitado |
| Telemetria junto do Lote 1 | ✅ Não esperar semana de coleta |
| Remover senha do localStorage | ✅ Remover `btoa/atob`; limpar `pdv_remember_pass` no primeiro login |
| Migrations via Sys-Init | ✅ Regra permanente |

---

## Bugs do v3 Corrigidos no v4

| Bug | Descrição | Correção |
|---|---|---|
| B1 | `catch` do refresh não relança erro → request original executa após falha | `return Promise.reject(err)` obrigatório no `catch` |
| B2 | Variável de módulo não coordena abas | Web Locks API (Lote 3) |
| B3 | Resposta de refresh perdida → família revogada | Janela de retentativa a definir (D10) |
| B4 | `contentHash` confiado do frontend | Backend recalcula internamente |
| B5 | `heart.schema.prisma` não `schema.prisma` | Arquivo correto identificado |

---

## LOTE 1 — Executar Agora

### Escopo Rígido
**Inclui:** telemetria + polling sequencial + timeouts de leitura + 4 estados de rede + banner  
**NÃO inclui:** nova contingência de checkout, `apiCheckout`, retry de escrita, ampliação de fallback offline

### Arquivos

| Arquivo | Tipo | O que muda |
|---|---|---|
| `frontend/src/lib/telemetry.ts` | NEW | Interceptor de logging anônimo de falhas |
| `frontend/src/contexts/ShiftContext.tsx` | MODIFY | setInterval → ciclo sequencial com flag `destroyed` |
| `frontend/src/pages/PosPage.tsx` | MODIFY | Idem para polling de comandas 15s |
| `frontend/src/lib/api.ts` | MODIFY | `timeout: 10_000` + interceptor 401 protegido |
| `frontend/src/hooks/useNetworkStatus.ts` | NEW | 4 estados: online/degraded/offline/recovering |
| `frontend/src/components/NetworkStatusBanner.tsx` | NEW | Banner contextual por estado |
| `frontend/src/App.tsx` | MODIFY | Montar banner |

### Detalhes Técnicos Críticos

**Polling (ShiftContext L148-159):**
```typescript
let destroyed = false;
let abortController: AbortController | null = null;

const poll = async () => {
  if (destroyed) return;
  if (!navigator.onLine || document.hidden) { setTimeout(poll, 30_000); return; }
  abortController = new AbortController();
  try {
    const savedOp = localStorage.getItem('currentOperator');
    const currentOp = savedOp ? JSON.parse(savedOp) : null;
    if (!currentOp) return;
    const res = await api.get(`/cash-registers/current?operatorId=${currentOp.id}`, {
      signal: abortController.signal,
      headers: { 'X-Silent-Poll': 'true' },
    });
    if (!destroyed) setCashRegister(res.data || null);
  } catch { /* silenciado */ }
  finally { if (!destroyed) setTimeout(poll, 30_000); }
};

poll();
return () => { destroyed = true; abortController?.abort(); };
```

**api.ts — apenas leitura, sem novo checkout:**
```typescript
export const api = axios.create({ baseURL: '/api', timeout: 10_000 });
// apiCheckout: aguarda Lote 2
// apiFiscal: pode ser criado como lib/apiFiscal.ts separado sem alterar api
```

**Interceptor 401 — Lote 1 (sem refresh ainda):**
```typescript
const isSilentPoll = error.config?.headers?.['X-Silent-Poll'];
const isNetworkOrTimeout = ['ECONNABORTED', 'ERR_CANCELED', 'ERR_NETWORK'].includes(error.code ?? '');

if (isNetworkOrTimeout) return Promise.reject(error);             // rede ≠ logout
if (error.response?.status === 401 && isSilentPoll) return Promise.reject(error); // polling ≠ logout
if (error.response?.status === 401 && !isAuthEndpoint) {
  // Lote 3 adiciona refresh aqui — por enquanto, logout direto
  useAuthStore.getState().logout();
  window.location.href = '/login';
}
```

**Probe de rede:**
```
Endpoint: GET /api (existente, sem auth, sem cache)
Frequência: 60s quando online, 15s quando degraded
Debounce: 2 confirmações consecutivas para mudar estado
```

**Banner:**
- `offline` → "📡 Sem conexão — X venda(s) salva(s) localmente"
- `degraded` → "⚠️ Conexão instável — operações podem ser mais lentas"
- `recovering` → "✅ Sincronizando X venda(s)..." → some quando `pendingCount = 0`
- `degraded` NÃO ativa contingência de checkout (aguarda Lote 2)

### Validação do Lote 1
- Wi-Fi conectado, API inacessível → banner amarelo `degraded`
- Polling 401 → sem redirect para /login
- Timeout de operação → erro em ≤10s, UI não trava
- DevTools Network → zero requests concorrentes de polling
- Banner some somente quando `pendingCount = 0`

---

## LOTE 2 — Design em Andamento (NÃO executar ainda)

### Pontos Abertos
- **D1:** Quando persistir a chave (antes do primeiro envio, não necessariamente antes do modal)
- **D2:** `contentHash` calculado pelo backend, não pelo frontend
- **D3:** Identidade da venda ≠ cache da resposta (ciclos de vida diferentes)
- **D4:** Recuperação de `PENDING` eterno (atomicidade, timeout de processamento)
- **D5:** Migração de registros offline com `tenantId = nome` (não ID real) → estado `AMBIGUOUS`
- **D6:** Contrato explícito para compostos/comandas offline antes de implementar
- **D7:** Cache PWA de estado de caixa — indicação visual quando dado vem do cache

### Arquivos Previstos
- `backend/prisma/schema.prisma` [MODIFY] — tabela `IdempotencyKey` (tenants) — migration 1
- `backend/src/sales/sales.service.ts` [MODIFY] — fluxo idempotente
- `frontend/src/components/PaymentModal.tsx` [MODIFY] — usar chave existente
- `frontend/src/lib/db.ts` [MODIFY] — tabela `pending_checkouts` + índice composto tenant
- `frontend/src/hooks/useOfflineSync.ts` [MODIFY] — filtro tenant + integração idempotencyKey

---

## LOTE 3 — Design em Andamento (NÃO executar ainda)

### Pontos Abertos
- **D8:** Propagação de erros no refresh (tabela de comportamentos por tipo de falha)
- **D9:** Web Locks API para coordenação entre abas
- **D10:** Resposta de refresh perdida → janela de retentativa sem revogar família
- **D11:** Persistência e restauração de carrinho (rascunho vs. pendente de confirmação)
- **D12:** `setToken` action no auth store (verificar contratos existentes)
- **D13:** `heart.schema.prisma` é o arquivo correto para `RefreshSession`

### Comportamentos Obrigatórios do Refresh (a implementar)
| Falha | Comportamento |
|---|---|
| Timeout/ERR_NETWORK durante refresh | Preservar trabalho. Não deslogar. Não repetir request. |
| HTTP 5xx/429 do refresh | Não deslogar. Aguardar recuperação. |
| HTTP 401 do refresh (expirado/inválido) | Logout com aviso. Salvar rascunho. **Não** repetir request original. |

### Arquivos Previstos
- `backend/prisma/heart.schema.prisma` [MODIFY] — tabela `RefreshSession` (Heart) — migration 2
- `backend/src/auth/auth.service.ts` [MODIFY] — refresh + rotação + revogação
- `backend/src/auth/auth.controller.ts` [MODIFY] — POST /auth/refresh
- `frontend/src/lib/api.ts` [MODIFY] — interceptor 401 com refresh correto
- `frontend/src/store/auth.ts` [MODIFY] — setToken action
- `frontend/src/store/cart.ts` [MODIFY] — persist middleware seguro
- `frontend/src/pages/LoginPage.tsx` [MODIFY] — remover btoa/atob

---

## Deploy
```
Lote 1 → agora → monitorar 48h com telemetria
Lote 2 → após D1-D7 resolvidos → migration 1 via Sys-Init
Lote 3 → após D8-D13 resolvidos → migration 2 via Sys-Init → staging → piloto 2 clientes
```
