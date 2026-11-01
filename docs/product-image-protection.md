# Imagens leves e manutenção pelo Sys-Init

## Estado — 08/09/2026

Implementação local autorizada por Lucas. Sem schema novo, migration, commit, push, publicação ou reinício dos serviços existentes. Nenhuma imagem/vínculo de cliente foi alterado. Testes de gravação usam apenas MySQL descartável e fotos sintéticas.

O fluxo CLI foi substituído pelo painel Sys-Init, reutilizando validações de pacote e troca condicional. Não é necessário baixar/restaurar bancos inteiros nem transferir pacotes manualmente. **“Otimizar imagens” é independente de “Atualizar Bancos”.** Instalar esta versão não inicia manutenção.

## Proteção de uploads futuros

- `/products/upload` e `/products/bulk-images`: otimizador comum no backend. Compras, celular e lote não salvam arquivo bruto por esses endpoints.
- Entrada individual até 8 MiB/50 megapixels, JPEG/PNG/WebP/GIF estático verificados pelo conteúdo. Lote mantém até 10 arquivos/5 MiB somados.
- Saída WebP <=800px no maior lado e <=200 KiB. Proporção preservada, sem ampliar, orientação EXIF corrigida, metadados removidos, transparência preservada. Qualidades 80/68/58; erro explícito se não atingir limite.
- HEIC/HEIF e animações não são suportados neste build: exportar JPG/PNG/WebP. Sem fallback bruto. Novos uploads guardam apenas a versão otimizada; guardar no aparelho o original novo se necessário. Preservação no Heart refere-se às fotos antigas em manutenção.
- Sharp 0.35.4 apenas no backend. Um processamento por vez, dois em espera, thread nativa única, cache 8 MiB, timeout 8s por etapa; dois requests de upload admitidos antes de Multer, excesso 429. Limites por processo; não garantem CPU zero/ausência de contenção.
- Conversão no upload/preparação, nunca a cada GET. 304 consulta metadados, sem BLOB. Falha temporária 503/no-store, não 404.
- PWA: imagens antes do JSON, CacheFirst, 300 entradas <=200 KiB (~59 MiB mais overhead). Não limpa IndexedDB/vendas offline. Cache HTTP/caches antigos independentes.
- LazyImage sem histórico ilimitado e reset por URL. Painel administrativo em chunk separado, sob demanda, sem biblioteca nova no navegador nem tarefa de imagem rodando no PDV.

## Procedimento simplificado

1. No Sys-Init, selecionar loja → **Otimizar imagens**.
2. **Analisar todas as imagens**: mostra peso atual e quantidade elegível. Sem escolher lote: inclui todas acima de 200KiB e até 8MiB, maiores primeiro. Até 10000 produtos com imagem por análise; catálogos acima disso são recusados explicitamente, nunca truncados silenciosamente.
3. **Otimizar todas**: prepara versões leves, uma por vez, sem alterar vínculos no banco. Mostra peso estimado após salvar e economia. Fotos já leves ficam intactas; inválidas/sem ganho suficiente aparecem como preservadas.
4. **Salvar aplicação**: confirmação simples, identificando loja e banco. Executa simulação automaticamente e só depois aplica. Não há campos manuais de hash/nome do banco/referência de backup; backend continua verificando tenant, hash, simulação e confirmação explícita. Não inventa registro de backup realizado. Mantenha backups atualizados de Heart e loja.
5. **Comparar qualidade** e **Histórico, detalhes e restauração** são opcionais/recolhidos. Restaurar pede confirmação e simula antes de reverter. Fotos alteradas pelo cliente continuam protegidas.

Operações antigas de 10 fotos continuam disponíveis no histórico com o escopo original. Para incluir todas, clicar em **Analisar todas as imagens** e usar a nova operação. Não aplicar manutenção real automaticamente ao atualizar o código.

Peso estimado refere-se às imagens usadas pelo catálogo, não a espaço liberado no servidor. Originais permanecem guardados; conflitos podem alterar a economia final.

## Interrupção e recuperação

- Sem cron/startup/F5 executando lotes. Reabrir lista históricos sem executar etapas.
- Uma requisição por vez e pausa de 300ms. Fechar/pausar impede a próxima; requisição em voo ainda pode concluir.
- Timeout pode significar resultado desconhecido: consultar estado e retomar **o mesmo lote**, não criar outro para repetir.
- ID da execução + cursor impedem reenvio de avançar outro produto. Progresso transmite somente metadados novos de fotos, sem reenviar a galeria inteira a cada passo. Commit seguido de falha ao salvar progresso é reconhecido por ID/hash na retomada.
- Reinício manual de simulação/aplicação invalida requests da execução anterior. Retomar aplicação/reversão exige confirmar novamente; o sistema preenche os identificadores técnicos, não o operador.
- `conflict`, `source_changed`, `target_changed`: item não alterado. `already_applied`/`already_reverted`: resultado idempotente, sem nova escrita.

## Segurança e armazenamento

- APIs `/api/tenants/setup/:tenantId/image-optimization/jobs` com PIN em header, inclusive prévias. SETUP_PIN/SQL_PIN configuradas; sem fallback embutido/segredo em query string. Limite de tentativas inválidas por processo. PIN compartilhado administrativo não identifica auditor individualmente.
- Tenant/banco resolvidos no Heart; identificadores validados. Mesmo MySQL e tabelas InnoDB obrigatórios. Mapeamento divergente recusado, nunca corrigido automaticamente.
- Originais ficam no Heart; novas imagens têm IDs imutáveis. Transação por produto entre Heart.images e tenant.products verifica hashes/bytes e troca somente imageUrl/updatedAt se vínculo ainda é exatamente o previsto. Não sobrescreve imagem compartilhada com outra loja.
- GET_LOCK no MySQL serializa manutenção entre processos. Conexão fechada libera trava. Vendas/uploads continuam, mas CPU/banco são compartilhados: preferir menor movimento.
- Cache de catálogo invalidado no processo executor. Outras réplicas podem manter TTL (~15s); navegador deve atualizar catálogo. Novos IDs evitam conteúdo antigo do cache imutável.
- Estado, WebPs e journal: `backups/.image-optimization/<UUID>/`. Compose existente já monta `./backups:/app/backups`. **Verificar volume persistente antes de operar**; perdê-lo compromete retomada/reversão pela UI. Guardar pasta junto aos backups.
- Arquivos privados fora da raiz pública/Git/contexto Docker. Journal com intenção antes do commit, resultado depois e fsync; estado por substituição atômica. Sem PIN/URL de conexão nos registros.
- Menos de 1 GiB livre bloqueia etapas; máximo 1000 diretórios. Sem limpeza automática de imagens, pacotes ou journals. Preservar originais **aumenta armazenamento**, mesmo reduzindo transferência ao navegador. Órfãos de preparação interrompida exigem revisão manual; não apagar lotes necessários à reversão.
- Acima de 8 MiB, URLs externas, formatos não suportados e catálogos acima do limite exigem tratamento separado. Logos e outras rotas de mídia não estão cobertos.

## Verificações e ressalvas

- 75 testes direcionados aprovados: 47 backend (limites/EXIF, upload/admissão, 304, hash/CAS/reversão, PIN/aprovações e resiliência de venda), 25 frontend (cache/lotes/resiliência) e 3 startup (sem schema automático).
- `backend/scripts/image-maintenance-smoke.cjs`: MySQL descartável sem portas/volumes de cliente, três schemas sintéticos. Preparação/simulação sem escrita, isolamento de lojas compartilhando original, aplicação, conflito com foto nova, trava entre conexões, recuperação após commit ANTES de salvar progresso e reversão preservando fotos/estoque. As duas execuções passaram; containers e bancos sintéticos descartados depois.
- Builds backend/frontend e Sharp nativo em Linux/musl aprovados. TypeScript global tem diagnósticos fora deste trabalho. Suíte genérica preexistente `sales.service.spec.ts` falha por mock ausente de IntegrationsService, não alterada aqui. Não confundir testes direcionados com homologação global.
- Nenhuma foto real otimizada nem banco de cliente atualizado. Falta validação visual do painel e amostra real antes de aplicação real.

Referências: [Sharp — limites](https://sharp.pixelplumbing.com/api-constructor/), [Sharp — saída](https://sharp.pixelplumbing.com/api-output/).
