import { Injectable, Logger } from '@nestjs/common';
import { HeartPrismaService } from '../../../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../../../prisma/tenant-prisma.service';
import { TenantContextService } from '../../../prisma/tenant-context.service';
import { FiscalPhpService } from '../../fiscal-php.service';
import { FiscalImportService } from '../../import/fiscal-import.service';
import { FiscalLoggerService } from '../../audit/fiscal-logger.service';

/**
 * DownloadStage — Sincroniza DF-e com observabilidade e diagnóstico completo.
 *
 * Princípios:
 *  - Toda execução produz um rastro completo de auditoria
 *  - Nenhuma execução termina sem deixar diagnóstico
 *  - O correlationId flui do frontend ao PHP/SEFAZ e é persistido
 */
@Injectable()
export class DownloadStage {
  private readonly logger = new Logger(DownloadStage.name);

  constructor(
    private readonly heart: HeartPrismaService,
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly phpService: FiscalPhpService,
    private readonly importService: FiscalImportService,
    private readonly fiscalLogger: FiscalLoggerService,
  ) {}

  async syncTenant(tenantId: string, databaseUrl: string, empresaInfo: any) {
    const correlationId = FiscalLoggerService.generateCorrelationId();
    const trace = this.fiscalLogger.startTrace(correlationId);
    
    trace.log(`═══ INÍCIO SINCRONIZAÇÃO DF-e ═══`);
    trace.log(`Tenant: ${tenantId}`);
    trace.log(`CNPJ: ${empresaInfo.cnpj ? empresaInfo.cnpj.substring(0, 4) + '****' : 'N/A'}`);
    trace.log(`Ambiente: ${empresaInfo.ambiente === 1 ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'} (tpAmb=${empresaInfo.ambiente})`);
    trace.log(`UF: ${empresaInfo.endereco?.uf || 'SP'}`);

    const startMs = Date.now();

    try {
      // 1. Obter estado de sincronização
      trace.step('load-state');
      let syncState = await this.heart.nfeSyncState.findUnique({
        where: { tenantId },
      });

      if (!syncState) {
        syncState = await this.heart.nfeSyncState.create({
          data: { tenantId, ultimoNSU: '0', status: 'syncing', correlationId },
        });
        trace.log('Primeiro sync — estado criado com NSU=0');
      } else {
        await this.heart.nfeSyncState.update({
          where: { tenantId },
          data: { status: 'syncing', correlationId },
        });
        trace.log(`Estado recuperado — último NSU: ${syncState.ultimoNSU}`);
      }

      // 1.5 Regra Anti-Spam SEFAZ (NT 2014.002): Se a última consulta retornou cStat 137 ou 656 há menos de 60 min, abortar requisição
      if (syncState && syncState.ultimaConsulta) {
        const lastDiag = (syncState.lastDiagnostico as any) || {};
        const lastCStat = lastDiag.resultado?.cStat;
        const minutesSinceLast = (Date.now() - new Date(syncState.ultimaConsulta).getTime()) / (1000 * 60);

        if (['137', '656'].includes(lastCStat) && minutesSinceLast < 60) {
          const waitRemaining = Math.ceil(60 - minutesSinceLast);
          trace.log(`⏭️ [SEFAZ BACKOFF] Consulta ignorada para evitar Consumo Indevido (cStat ${lastCStat}). Próxima consulta liberada em ${waitRemaining} min.`);
          trace.finish();

          await this.heart.nfeSyncState.update({
            where: { tenantId },
            data: { status: 'idle' },
          });

          return {
            correlationId,
            ultNSU: syncState.ultimoNSU,
            novos: 0,
            duplicados: 0,
            processados: 0,
            tempo: 0,
            diagnostico: {
              statusInterno: 'SEFAZ_BACKOFF',
              resultado: {
                cStat: '656',
                xMotivo: `A SEFAZ exige 1 hora de intervalo quando não há novas notas. Próxima busca liberada em ${waitRemaining} minuto(s).`,
                ultNSU: syncState.ultimoNSU,
                maxNSU: syncState.ultimoNSU,
                documentosTotal: 0,
              },
            },
          };
        }
      }

      // 2. Chamar PHP para buscar novos DF-e
      trace.step('php-distribuicao');
      const payload = {
        empresa: empresaInfo,
        certPfxBase64: empresaInfo.certificadoPfxBase64,
        certSenha: empresaInfo.certificadoSenha,
        ultNSU: syncState.ultimoNSU,
        correlationId,
      };

      trace.log(`Enviando requisição ao serviço PHP com ultNSU=${syncState.ultimoNSU}`);

      const response = await this.phpService.post('/nfe/distribuicao/nsu', payload, correlationId);
      
      // 3. Logar diagnóstico completo recebido do PHP
      trace.step('diagnostico');
      const diag = response.diagnostico || {};
      
      if (diag.certificado) {
        const cert = diag.certificado;
        trace.log(`📜 Certificado: ${cert.carregado ? '✅ Carregado' : '❌ Não carregado'}`);
        trace.log(`   CN: ${cert.cn || 'N/A'}`);
        trace.log(`   Válido até: ${cert.validoAte || 'N/A'} (${cert.diasRestantes ?? '?'} dias restantes)`);
        trace.log(`   Emissora: ${cert.emissora || 'N/A'}`);
        if (cert.expirado) {
          trace.error(`⚠️ CERTIFICADO EXPIRADO! Renove o certificado A1.`);
        }
      }

      if (diag.configuracao) {
        trace.log(`⚙️ Ambiente: ${diag.configuracao.ambiente} | CNPJ: ${diag.configuracao.cnpj} | UF: ${diag.configuracao.uf}`);
      }

      if (diag.requisicao) {
        trace.log(`📡 Requisição: ${diag.requisicao.tentativas} tentativa(s) | Tempo: ${diag.requisicao.tempoMs}ms`);
      }

      if (diag.resultado) {
        trace.log(`📋 Resposta SEFAZ: cStat=${diag.resultado.cStat} | ${diag.resultado.xMotivo || 'sem motivo'}`);
        trace.log(`   Documentos: ${diag.resultado.documentosTotal} | ultNSU: ${diag.resultado.ultNSU} | maxNSU: ${diag.resultado.maxNSU}`);
      }

      // Logar etapas do PHP
      if (diag.etapas && Array.isArray(diag.etapas)) {
        for (const etapa of diag.etapas) {
          const icon = etapa.status.includes('ERRO') || etapa.status.includes('FALHOU') ? '❌' : '✅';
          trace.log(`   ${icon} [${etapa.nome}] ${etapa.status}${etapa.detalhe ? ' — ' + etapa.detalhe : ''}`);
        }
      }

      if (diag.erro) {
        trace.error(`🚨 ERRO: ${diag.erro.tipo} — ${diag.erro.mensagem}`);
        trace.error(`   Ação recomendada: ${diag.erro.acao}`);
        if (diag.erro.stackTrace) {
          trace.error(`   Stack: ${diag.erro.stackTrace.substring(0, 500)}`);
        }
      }

      // Logar XML bruto da SEFAZ quando retorno inesperado
      const cStat = diag.resultado?.cStat || response.cStat;
      if (cStat && !['137', '138'].includes(cStat)) {
        trace.warn(`⚠️ cStat inesperado: ${cStat}. XML bruto da SEFAZ registrado no diagnóstico.`);
        if (diag.resposta?.xmlBruto) {
          trace.warn(`   XML (primeiros 500 chars): ${String(diag.resposta.xmlBruto).substring(0, 500)}`);
        }
      }

      trace.log(`═══ STATUS INTERNO FINAL: ${diag.statusInterno || 'DESCONHECIDO'} ═══`);

      // 4. Processar documentos
      trace.step('process-docs');
      const documentos = response.documentos || [];
      let importCount = 0;
      let duplicateCount = 0;

      if (documentos.length > 0) {
        trace.log(`Processando ${documentos.length} documento(s)...`);
      }
      
      for (const doc of documentos) {
        if (doc.schema && doc.schema.includes('procNFe')) {
          try {
            await this.tenantContext.run({ tenantId, databaseUrl, userId: 'system_cron' }, async () => {
              await this.importService.uploadXml(doc.xml, 'system_cron');
            });
            importCount++;
            trace.log(`✅ NF-e ${doc.chave} (NSU ${doc.nsu}) importada com sucesso.`);
          } catch (error: any) {
            if (error.message && (error.message.includes('já foi importada') || error.message.includes('Conflict'))) {
              duplicateCount++;
              trace.log(`⏭️ NF-e ${doc.chave} (NSU ${doc.nsu}) já importada — ignorada.`);
            } else {
              trace.error(`❌ Falha ao importar NF-e ${doc.chave} (NSU ${doc.nsu}): ${error.message}`);
            }
          }
        } 
        else if (doc.schema === 'resNFe_v1.01.xsd') {
          trace.log(`📄 Resumo recebido (NSU ${doc.nsu} | Chave: ${doc.chave}). Tipo: resNFe (aguardando procNFe).`);
        }
      }

      // 5. Persistir estado e diagnóstico
      trace.step('update-state');
      const tempoMs = Date.now() - startMs;

      // Preparar diagnóstico sanitizado para persistência (sem XML bruto para não sobrecarregar o banco)
      const diagPersistido = { ...diag };
      if (diagPersistido.resposta) {
        diagPersistido.resposta = { 
          xmlBrutoTamanho: diagPersistido.resposta.xmlBrutoTamanho,
          // Omitir xmlBruto no banco para economizar espaço
        };
      }

      await this.heart.nfeSyncState.update({
        where: { tenantId },
        data: {
          ultimoNSU: response.ultNSU || syncState.ultimoNSU,
          ultimaConsulta: new Date(),
          status: diag.erro ? 'error' : 'idle',
          notasBaixadas: importCount,
          tempoGastoMs: tempoMs,
          lastError: diag.erro ? `${diag.erro.tipo}: ${diag.erro.mensagem}` : null,
          correlationId,
          lastDiagnostico: diagPersistido,
        },
      });

      trace.log(`Sincronização concluída em ${tempoMs}ms. ${importCount} notas importadas, ${duplicateCount} duplicadas.`);
      trace.finish();

      return {
        correlationId,
        ultNSU: response.ultNSU || syncState.ultimoNSU,
        novos: documentos.length,
        duplicados: duplicateCount,
        processados: importCount,
        tempo: parseFloat((tempoMs / 1000).toFixed(2)),
        diagnostico: diag,
      };

    } catch (error: any) {
      trace.error(`🚨 ERRO FATAL na sincronização: ${error.message}`);
      if (error.stack) {
        trace.error(`Stack: ${error.stack.substring(0, 500)}`);
      }
      trace.finish();
      const tempoMs = Date.now() - startMs;
      
      await this.heart.nfeSyncState.updateMany({
        where: { tenantId },
        data: { 
          status: 'error',
          lastError: error.message,
          ultimaConsulta: new Date(),
          tempoGastoMs: tempoMs,
          correlationId,
          lastDiagnostico: {
            correlationId,
            statusInterno: 'ERRO_FATAL',
            erro: { tipo: 'ERRO_FATAL', mensagem: error.message },
          } as any,
        },
      });
      throw error;
    }
  }
}
