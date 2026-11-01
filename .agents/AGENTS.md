# Database Migrations

Para este projeto multi-tenant (PDV), as atualizações/migrations nos bancos de dados dos clientes (tenants) **NÃO devem ser feitas rodando comandos Prisma (como `prisma migrate` ou `prisma db push`) diretamente no terminal**, sob o risco de corromper conexões ou causar perda de dados em lote.

Toda vez que uma alteração no esquema for feita (em `schema.prisma`), a atualização dos bancos deve ser realizada **exclusivamente através da interface do sistema Sys-Init (botão 'Atualizar Bancos' no painel de Gestão de Tenants)** pelo usuário. A IA deve apenas editar os arquivos `.prisma` e orientar o usuário a clicar no botão.

---

# Documentação Automática no Obsidian (REGRA PERMANENTE)

## Objetivo
O Obsidian localizado em `C:\Users\Lucas Souza\Documents\LUCAS` é a **base de conhecimento viva** do sistema 7Bar PDV. Ele deve refletir **sempre o estado atual e real** do sistema, funcionando como suporte técnico qualificado para o desenvolvedor.

## Regra Central
**TODA e QUALQUER alteração feita no sistema — seja código, banco de dados, infraestrutura, integração, fluxo de negócio ou arquitetura — deve ser automaticamente registrada e atualizada no Obsidian, sem que o usuário precise solicitar.**

Esta regra é **inegociável** e tem prioridade máxima em todas as conversas.

---

## O que Deve Ser Atualizado Automaticamente

### 1. Alterações em Arquivos de Código
Sempre que qualquer arquivo do projeto for criado, editado ou removido, identifique a qual área do sistema pertence e atualize a nota correspondente no Obsidian:

| Arquivo/Pasta Alterada | Nota do Obsidian a Atualizar |
|---|---|
| `backend/prisma/schema.prisma` ou `heart.schema.prisma` | `Sistema PDV (7bar)/3. Banco de Dados e Migrações.md` |
| `backend/src/nfce/` ou `nfce-service/` | `Sistema PDV (7bar)/4. Emissão de NFC-e e Fluxo Fiscal.md` |
| `backend/src/fiscal/` | `Sistema PDV (7bar)/4. Emissão de NFC-e e Fluxo Fiscal.md` |
| `frontend/src/pages/` ou `frontend/src/app/` | `Sistema PDV (7bar)/5. Módulos e Fluxos do Frontend.md` |
| `frontend/src/components/` | `Sistema PDV (7bar)/5. Módulos e Fluxos do Frontend.md` |
| `backend/src/` (qualquer módulo NestJS) | `Sistema PDV (7bar)/6. Módulos e Endpoints do Backend.md` |
| `integrations-hub/` | `Sistema PDV (7bar)/7. Hub de Integrações.md` |
| `docker-compose.yml` ou qualquer `Dockerfile` | `Sistema PDV (7bar)/8. Infraestrutura e Deploy.md` |
| Estrutura geral / novo serviço / nova tecnologia | `Sistema PDV (7bar)/1. Visão Geral do Sistema.md` |
| `backend/src/prisma/` (conexão e contexto) | `Sistema PDV (7bar)/2. Arquitetura Multi-Tenant.md` |

### 2. Novas Funcionalidades ou Módulos
Se uma nova funcionalidade, módulo, rota, componente ou serviço for criado que **não existe em nenhuma nota atual**, criar uma nova nota temática na pasta `Sistema PDV (7bar)/` com numeração sequencial e conteúdo completo. Exemplo: `9. Módulo Fiscal - Importação de XML.md`.

### 3. Correções de Bugs
Ao corrigir um bug, adicionar na nota correspondente ao módulo afetado uma seção `## 🐛 Bugs Corrigidos` com a data, descrição do problema e da solução aplicada.

### 4. Decisões de Arquitetura
Sempre que uma decisão arquitetural relevante for tomada (ex: trocar de biblioteca, adicionar um novo serviço, mudar uma estratégia de dados), registrar na nota correspondente em uma seção `## 📐 Decisões Técnicas`.

### 5. Log de Alterações (Changelog)
Manter o arquivo `C:\Users\Lucas Souza\Documents\LUCAS\Sistema PDV (7bar)\CHANGELOG.md` atualizado com um histórico cronológico reverso de todas as alterações realizadas no sistema. Formato:

```markdown
## [Data] — Descrição Curta
- Detalhe 1
- Detalhe 2
```

---

## Como Executar a Atualização

### A cada alteração de código:
1. Identificar qual(is) nota(s) do Obsidian são afetadas pela alteração (tabela acima).
2. Abrir a nota correspondente e atualizar o conteúdo afetado (adicionar, modificar ou remover a informação desatualizada).
3. Registrar a alteração no `CHANGELOG.md`.
4. **NÃO reescrever a nota inteira** — atualizar somente as seções relevantes para preservar o histórico e contexto existente.

### Ao final de cada conversa (fluxo "Final do Dia"):
1. Ler o transcript completo da conversa.
2. Verificar o `git status` no workspace.
3. Gerar o relatório diário em `Diario de Bordo/Relatorio - YYYY-MM-DD.md`.
4. Atualizar o `Bem-vindo.md` com o link do novo relatório.

---

## Vault do Obsidian — Estrutura de Pastas

```
C:\Users\Lucas Souza\Documents\LUCAS\
│
├── Bem-vindo.md                          ← Painel inicial com links para tudo
│
├── Sistema PDV (7bar)\
│   ├── 1. Visão Geral do Sistema.md
│   ├── 2. Arquitetura Multi-Tenant.md
│   ├── 3. Banco de Dados e Migrações.md
│   ├── 4. Emissão de NFC-e e Fluxo Fiscal.md
│   ├── 5. Módulos e Fluxos do Frontend.md
│   ├── 6. Módulos e Endpoints do Backend.md
│   ├── 7. Hub de Integrações.md
│   ├── 8. Infraestrutura e Deploy.md
│   └── CHANGELOG.md                      ← Histórico de todas as alterações
│
└── Diario de Bordo\
    ├── Relatorio - 2026-07-19.md
    └── ...                               ← Um arquivo por expediente
```

---

## Padrão de Qualidade das Notas

Toda nota do Obsidian deve:
- Usar linguagem clara e técnica, em português.
- Conter exemplos de código quando relevante.
- Usar emojis de categoria para facilitar leitura visual.
- Usar wikilinks `[[Nome da Nota]]` para interligar notas relacionadas.
- Ter uma seção `## 🔗 Relações Úteis` ao final com links para notas relacionadas.
- Refletir **apenas o que existe e funciona atualmente** — não documentar features planejadas aqui (usar o Diário de Bordo para isso).
