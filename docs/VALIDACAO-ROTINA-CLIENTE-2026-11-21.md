# Validação de rotina com cópia da base do cliente — 21/11/2026

## Método

A base local `petsh` e o Heart foram copiados integralmente para um MySQL 8 temporário, em memória, acessível apenas em `127.0.0.1:3311`. O roteiro em `scripts/qa-client-routine-20261121.cjs` exige essa porta e os nomes das bases, usa os serviços compilados do backend, Prisma e MySQL reais, além dos planos, preços, profissionais e regras de comissão cadastrados na loja. Os tokens operacionais de QA foram assinados somente para a cópia; a autorização foi verificada pelo `StationAccessService` real. O envio externo de mensagens foi substituído por função local vazia. Este ensaio não atravessou HTTP nem a interface web.

Contagens da base original antes e depois: 68 tutores, 91 pets, 201 agendamentos, 74 contratos, 218 comissões e 10 vendas. Nenhum agendamento com a marca de QA foi encontrado na base original. A cópia temporária foi removida e o conteúdo dos dumps temporários foi zerado.

## Resultado

**12 etapas aprovadas, 0 falhas na execução final.**

| Rotina | Verificação persistida na cópia |
|---|---|
| Permissão administrativa | Profissional habilitado autorizado; profissional comum bloqueado. |
| Contratação | Plano real de R$ 90,00 pago e uma sessão reservada. |
| Troca de serviço | Reserva antiga zerada, nova reserva criada, dois eventos de ledger; diferença de R$ 50,00 cobrada uma vez; reenvio da mesma troca recusado. |
| Etapas do pacote | Nova sessão avançou até a conclusão; consumo e evento de ledger registrados uma vez; repetição da conclusão recusada. |
| Táxi Dog após pacote concluído | Reabertura autorizada; R$ 10,00 cobrados em venda separada; valor do contrato e consumo da sessão preservados. |
| Atendimento avulso | Serviço real de R$ 50,00, etapas Check-in → Banho → Finalização → Pronto, comissão de banho de R$ 0,50 e venda de R$ 50,00; o checkout marcou o atendimento como concluído. |
| Transferência de comissão | A mesma linha passou ao novo profissional, sem linha remanescente para o anterior, com registro no histórico. |
| Reabertura | Profissional comum bloqueado; administrador autorizado; status voltou a Pronto e `completedAt` foi limpo com histórico. |
| Adicional e transporte após venda | Serviço de R$ 15,00 + Táxi Dog de R$ 10,00 cobrados em nova venda de R$ 25,00, dividida em Pix e dinheiro. |
| Comissão do adicional e duplicidade | Comissão de R$ 0,50 persistida e transferida ao profissional escolhido; recebedor anterior zerado; segunda cobrança recusada. |
| Estorno e nova cobrança | O estorno da venda principal foi bloqueado enquanto o adicional estava pago. Após estornar o adicional e a venda principal, o atendimento voltou a Pronto, `completedAt` e `chargedSaleId` foram limpos e R$ 75,00 puderam ser cobrados novamente. |
| Duas trocas positivas | Diferenças incrementais reais de R$ 10,00 e R$ 40,00 geraram R$ 50,00 a receber, a diferença exata entre o primeiro e o último serviço; quatro eventos de troca foram registrados no ledger. Não houve cobrança duplicada nesse cenário. |

O roteiro incluiu estornos, nova cobrança e um segundo contrato na cópia isolada; o resultado estruturado está em `docs/auditoria-rotina-cliente-2026-11-21.json`. A base original manteve 68 tutores, 91 pets, 201 agendamentos, 74 contratos, 218 comissões e 10 vendas, sem marca de QA depois da repetição final. O container temporário foi removido e os dumps e o arquivo de estado foram zerados.

## Limite do parecer

A persistência e as regras de negócio destes fluxos foram validadas com a base real copiada. Após as correções desta rodada, o backend passou em 71 suítes e 463 testes, e backend e frontend compilaram. O frontend passou em 36 testes, com 1 cenário Nginx marcado como skip na suíte automatizada. Ainda falta repetir as ações pela interface e pelas rotas HTTP da versão final. O estado do Git ainda tem alterações não commitadas, e os alertas de dependências registrados na mesma auditoria exigem triagem antes da publicação.
