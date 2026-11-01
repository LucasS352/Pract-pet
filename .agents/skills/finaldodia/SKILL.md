---
name: finaldodia
description: Acionado quando o usuário digita "final do dia", "finaldodia", "/finaldodia" ou sinaliza o término do expediente. Gera um relatório completo com todas as conversas, trabalhos, análises, sugestões e próximos passos, atualizando o Obsidian.
---

# Fluxo "Final do Dia" — Fechamento de Expediente

Sempre que o usuário usar as palavras **"final do dia"**, **"finaldodia"** ou expressões similares como "encerrar o dia", "acabou o expediente", "fechar o dia", execute o seguinte fluxo completo:

---

## PASSO 1 — Vasculhar o Transcript da Conversa Atual

Leia o transcript completo da conversa atual para extrair todos os tópicos discutidos:

```
C:\Users\Lucas Souza\.gemini\antigravity\brain\<conversation-id>\.system_generated\logs\transcript.jsonl
```

O `<conversation-id>` é o ID da conversa atual (disponível nos metadados do agente). Leia o arquivo `transcript.jsonl` linha por linha e extraia:
- Todos os pedidos feitos pelo usuário (campos `type: "USER_INPUT"`).
- Todas as ações executadas pelo agente (campos `type: "PLANNER_RESPONSE"`).
- Todos os arquivos criados, editados ou lidos.
- Todos os comandos executados.
- Todos os tópicos técnicos discutidos.

Se houver conversas recentes listadas no histórico (`conversation_summaries`), inclua também um resumo dessas conversas no relatório.

---

## PASSO 2 — Inspecionar o Código (Git + Arquivos)

Execute os seguintes comandos no workspace do projeto (`c:\Users\Lucas Souza\Desktop\PDV`):

1. **Status atual do repositório**:
   ```
   git status
   ```

2. **Log dos commits de hoje** (substitua a data atual):
   ```
   git log --since="today" --oneline --all
   ```

3. **Arquivos modificados hoje**:
   ```
   git diff --stat HEAD
   ```

Use essas informações para listar exatamente o que foi alterado no código-fonte do projeto.

---

## PASSO 3 — Gerar o Relatório Diário no Obsidian

Crie (ou sobrescreva se já existir) o arquivo:
`C:\Users\Lucas Souza\Documents\LUCAS\Diario de Bordo\Relatorio - YYYY-MM-DD.md`

Substitua `YYYY-MM-DD` pela **data local atual** (ex: `2026-07-19`).

O relatório DEVE conter obrigatoriamente estas seções:

```markdown
# 📅 Relatório de Expediente — DD/MM/YYYY

## ⏱️ Encerramento
- **Data**: DD de Mês de YYYY
- **Hora**: HH:MM (horário local)

---

## 💬 Resumo das Conversas do Dia
> Liste todos os tópicos e pedidos feitos pelo usuário durante o dia, extraídos do transcript.
- Conversa sobre X: [resumo do que foi discutido]
- Conversa sobre Y: [resumo do que foi discutido]

---

## ✅ Trabalhos Realizados
> Liste tudo que foi concretamente feito — arquivos criados, editados, funcionalidades implementadas, bugs corrigidos, etc.
- [ ] Tarefa concluída 1
- [ ] Tarefa concluída 2

---

## 🔬 Análises Realizadas
> Resumo dos diagnósticos, estudos de arquitetura, revisões de código e conclusões técnicas do dia.

---

## 💡 Sugestões de Melhoria
> Ideias e oportunidades identificadas durante o dia de trabalho, para implementação futura.
- 💡 Sugestão 1
- 💡 Sugestão 2

---

## 🚀 Próximos Passos (Prioridades para amanhã)
> Checklist de prioridades para o próximo expediente, ordenado por importância.
- [ ] Prioridade Alta: ...
- [ ] Prioridade Média: ...
- [ ] Prioridade Baixa: ...

---

## 📁 Arquivos Alterados no Código (Git)
> Lista dos arquivos modificados, adicionados ou removidos do repositório do PDV.
- Arquivo 1 — descrição da mudança
- Arquivo 2 — descrição da mudança

---
*Relatório gerado automaticamente pelo Antigravity em DD/MM/YYYY às HH:MM.*
```

---

## PASSO 4 — Atualizar o Painel Inicial do Obsidian

Abra o arquivo `C:\Users\Lucas Souza\Documents\LUCAS\Bem-vindo.md` e garanta que existe a seção:

```markdown
## 📅 Diários de Bordo Recentes (Fluxo "Final do Dia")
```

Adicione o link do novo relatório no **topo** da lista dessa seção (mais recente primeiro), mantendo os links anteriores abaixo. Exemplo:

```markdown
## 📅 Diários de Bordo Recentes (Fluxo "Final do Dia")
- 📝 **[[Diario de Bordo/Relatorio - 2026-07-19|Relatório — 19/07/2026]]** ← Mais recente
- 📝 **[[Diario de Bordo/Relatorio - 2026-07-18|Relatório — 18/07/2026]]**
```

---

## PASSO 5 — Responder ao Usuário no Chat

Finalize com uma mensagem no chat contendo:
1. Um **resumo amigável** dos principais pontos do dia (máximo 5 bullets).
2. Confirmação de que o relatório foi gerado e onde está localizado no Obsidian.
3. Uma **mensagem de despedida** calorosa e profissional, desejando um bom descanso.

---

## ⚠️ Regras Importantes

- **NUNCA pule o PASSO 1** — o transcript é a principal fonte de verdade do dia.
- O relatório deve ser **rico e detalhado**, refletindo genuinamente o que foi feito, não um template genérico.
- Se o usuário não tiver feito nenhuma alteração de código, deixe a seção "Arquivos Alterados" como `Nenhuma alteração de código hoje.`
- Sempre use a **data e hora locais** do sistema (disponível nos metadados da mensagem do usuário).
