# Imagens em Massa — correção local e validação — 2026-09-08

## Escopo

Correção autorizada por Lucas: nomes acentuados, upload de centenas de imagens, estados visuais e consumo de recursos. Sem alterações em vendas, sessões, schemas, configuração Nginx ou dependências. Sem commit/push/deploy ou recriação de containers. Nenhuma imagem original ou associação real foi modificada.

## Implementado

- Manifesto JSON UTF-8 com nome original e ID por arquivo; nome ASCII no multipart. Resposta por ID, sem depender do nome decodificado pelo servidor.
- Compatibilidade com nomes legados interpretados como Latin-1, com conversão reversível para UTF-8.
- Lotes sequenciais limitados a 10 arquivos e 5 MiB somados (abaixo dos 10 MiB do proxy). Imagem individual acima de 5 MiB recebe erro local.
- Seleção de pasta, filtrando JPG/PNG/WEBP/GIF; não monitora nem sincroniza a pasta posteriormente. Nomes repetidos são ignorados na seleção.
- Máximo de 20 miniaturas por página, carregamento lazy e liberação dos object URLs. Sem base64 da pasta inteira.
- Progresso por lote confirmado, erros e ausência de correspondência explicitados por arquivo. Resposta incompleta nunca deixa spinner ativo.
- Falha de transporte interrompe os próximos lotes, sem retry automático. Lote sem confirmação deve ser conferido no catálogo antes de reenviar; resultados confirmados são preservados na tela e demais arquivos ficam pendentes. A lista não persiste após recarga da página.
- Limpeza, seleção e remoção bloqueadas enquanto envia; unmount aborta e impede próximos lotes. Loja original conferida antes de cada requisição.
- Match exato priorizado; correspondências ambíguas ou nome normalizado vazio não escolhem produtos arbitrariamente.

## Evidências

- Backend: `npm test -- --runInBand bulk-images.spec.ts sales-resilience.spec.ts sales-delivery.spec.ts`: 20 testes aprovados (7 específicos de imagens).
- Frontend: `node --test tests/bulk-images.test.cjs tests/sales-resilience.test.cjs`: 19 testes aprovados (7 específicos de imagens).
- Tests de imagens: multipart instalado do Multer, UTF-8, metadados inválidos, limites, ambiguidade, falha individual, divisão em lotes, resposta perdida, ausência de confirmação, sequenciamento e abort.
- `npm run build` aprovado no backend e frontend; Vite mantém avisos sobre chunks grandes/importação de xlsx. Nenhuma dependência adicionada.
- `npx tsc --noEmit --pretty false` do frontend não passa no projeto geral: 37 diagnósticos fora dos arquivos desta correção. Não afirmar TypeScript global limpo.
- Metadados reais da pasta `BANCO DE FOTOS PDV`: 352 JPGs, 50 lotes, máximo de 10 arquivos e 4,993 MiB por lote. Apenas nomes e tamanhos consultados; imagens não enviadas.

## Teste manual de Lucas

1. Usar **frontend e backend locais atualizados**. Os builds em disco não atualizam automaticamente containers Docker já rodando. Nenhum container foi reiniciado nesta correção.
2. Abrir Imagens em Massa e selecionar primeiro a imagem `Álcool Etílico Líquido 70° Frasco 1L.jpg`. Confirmar nome do produto cadastrado e resultado sem spinner permanente.
3. Usar **Selecionar pasta de imagens** e escolher `C:\Users\Lucas Souza\Desktop\BANCO DE FOTOS PDV`. Planilhas devem ser ignoradas.
4. Enviar e acompanhar lotes; conferir imagens de produtos e todos os erros/sem correspondência pelas páginas da lista. Nomes ambíguos exigem correção manual do nome ou da associação.
5. Opcional: interromper rede durante um lote; confirmar aviso sem reenvio automático e preservação de sucessos anteriores. Conferir catálogo antes de reenviar itens sem confirmação.

Não foi executado teste visual integrado ou escrita em bancos reais nesta rodada. Aprovação de produção depende da validação local do usuário.
