<?php
declare(strict_types=1);

namespace App;

use NFePHP\NFe\Tools;
use NFePHP\Common\Certificate;
use NFePHP\Common\Soap\SoapCurl;

/**
 * NfceDistribuidor — Consulta DF-e com Observabilidade e Diagnóstico Completo.
 *
 * Princípios:
 *  1. Observabilidade — toda etapa produz informações úteis
 *  2. Rastreabilidade — correlationId flui do frontend ao SEFAZ
 *  3. Auditabilidade — toda resposta pode ser consultada posteriormente
 *  4. Diagnóstico — erros indicam onde, porquê e qual ação tomar
 */
class NfceDistribuidor
{
    private array $diag;

    private function initDiag(string $correlationId): void
    {
        $this->diag = [
            'correlationId' => $correlationId,
            'timestamp'     => date('c'),
            'statusInterno' => 'INICIADO',
            'etapas'        => [],
            'certificado'   => null,
            'configuracao'  => null,
            'requisicao'    => null,
            'resposta'      => null,
            'resultado'     => null,
            'erro'          => null,
        ];
    }

    private function addEtapa(string $nome, string $status, ?string $detalhe = null): void
    {
        $this->diag['etapas'][] = [
            'nome'     => $nome,
            'status'   => $status,
            'detalhe'  => $detalhe,
            'momento'  => date('c'),
        ];
        $this->diag['statusInterno'] = $status;
    }

    /**
     * Consulta NF-es destinadas ao CNPJ a partir do último NSU conhecido.
     * Retorna diagnóstico completo em TODA execução.
     */
    public function consultarNsU(array $payload): array
    {
        $correlationId = $payload['correlationId'] ?? ('SYNC-' . date('Ymd') . '-' . substr(uniqid(), -8));
        $this->initDiag($correlationId);
        $startMs = hrtime(true);

        $empresa = $payload['empresa'] ?? [];
        $certB64 = $payload['certPfxBase64'] ?? '';
        $senha   = $payload['certSenha']     ?? '';
        $ultNSU  = $payload['ultNSU']        ?? '0';
        $amb     = (int) ($empresa['ambiente'] ?? 2);
        $cnpj    = preg_replace('/\D/', '', $empresa['cnpj'] ?? '');

        $this->diag['configuracao'] = [
            'ambiente'     => $amb === 1 ? 'PRODUCAO' : 'HOMOLOGACAO',
            'ambienteCod'  => $amb,
            'cnpj'         => $this->maskCnpj($cnpj),
            'uf'           => $empresa['endereco']['uf'] ?? 'SP',
            'ultNSU'       => $ultNSU,
            'modelo'       => 55,
        ];

        try {
            // ── ETAPA 1: Certificado ──────────────────────────────────────
            $this->addEtapa('CERTIFICADO', 'VALIDANDO_CERTIFICADO');
            $certInfo = $this->validarCertificado($certB64, $senha);
            $this->diag['certificado'] = $certInfo;

            if ($certInfo['expirado']) {
                $this->addEtapa('CERTIFICADO', 'ERRO_CERTIFICADO_EXPIRADO',
                    "Certificado expirado em {$certInfo['validoAte']}. Renove o certificado A1.");
                return $this->buildResponse([], '0', '0', null, null, $startMs);
            }

            $this->addEtapa('CERTIFICADO', 'CERTIFICADO_OK',
                "CN: {$certInfo['cn']} | Válido até: {$certInfo['validoAte']} | {$certInfo['diasRestantes']} dias restantes");

            // ── ETAPA 2: Configuração sped-nfe ────────────────────────────
            $this->addEtapa('CONFIGURACAO', 'CONFIGURANDO_SPED');

            $configArray = [
                'atualizacao' => date('Y-m-d H:i:s'),
                'tpAmb'       => $amb,
                'razaosocial' => $empresa['razaoSocial'] ?? '',
                'cnpj'        => $cnpj,
                'siglaUF'     => $empresa['endereco']['uf'] ?? 'SP',
                'schemes'     => 'PL_009_V4',
                'versao'      => '4.00',
                'tokenIBPT'   => '',
                'CSC'         => $empresa['csc']   ?? '',
                'CSCid'       => $empresa['idCsc'] ?? '',
            ];

            $config = json_encode($configArray);

            $certPfx     = base64_decode($certB64);
            $certificate = Certificate::readPfx($certPfx, $senha);
            $tools       = new Tools($config, $certificate);
            $tools->model(55); // NF-e (Distribuição DF-e usa modelo 55)

            $soap = new SoapCurl($certificate);
            $soap->disableCertValidation(true);
            $soap->httpVersion('1.1');
            $soap->setSecurityLevel(true);
            $soap->loadCA('/etc/ssl/certs/ca-certificates.crt');
            $tools->loadSoapClass($soap);

            $this->addEtapa('CONFIGURACAO', 'CONFIG_OK', "sped-nfe configurado com modelo 55, tpAmb={$amb}");

            // ── ETAPA 3: Requisição à SEFAZ ───────────────────────────────
            $this->addEtapa('REQUISICAO', 'ENVIANDO_REQUISICAO', "ultNSU={$ultNSU}");

            $maxAttempts = 3;
            $response    = null;
            $lastError   = null;
            $attemptsMade = 0;

            for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
                $attemptsMade = $attempt;
                $reqStartMs = hrtime(true);

                try {
                    $response = $tools->sefazDistDFe((int)$ultNSU);

                    $reqElapsedMs = (int)((hrtime(true) - $reqStartMs) / 1e6);
                    $this->diag['requisicao'] = [
                        'tentativas'   => $attemptsMade,
                        'tempoMs'      => $reqElapsedMs,
                    ];
                    $this->addEtapa('REQUISICAO', 'REQUISICAO_ENVIADA',
                        "Resposta recebida em {$reqElapsedMs}ms (tentativa {$attempt}/{$maxAttempts})");
                    break;

                } catch (\Exception $e) {
                    $reqElapsedMs = (int)((hrtime(true) - $reqStartMs) / 1e6);
                    $lastError = $e;
                    $msg = $e->getMessage();

                    $isNetworkError = stripos($msg, 'SSL_ERROR_SYSCALL') !== false
                        || stripos($msg, 'timeout') !== false
                        || stripos($msg, 'connection') !== false
                        || stripos($msg, 'Could not resolve') !== false;

                    $isSoapFault = stripos($msg, 'SoapFault') !== false
                        || stripos($msg, 'SOAP') !== false;

                    $isAuthError = stripos($msg, 'SSL certificate') !== false
                        || stripos($msg, '403') !== false
                        || stripos($msg, 'Unauthorized') !== false;

                    if ($isNetworkError && $attempt < $maxAttempts) {
                        $sleepMs = 500 * (2 ** ($attempt - 1));
                        $this->addEtapa('REQUISICAO', 'TENTATIVA_FALHOU',
                            "Tentativa {$attempt}: {$msg} | Retentando em {$sleepMs}ms");
                        usleep($sleepMs * 1000);
                        continue;
                    }

                    // Classificar o erro
                    $tipoErro = 'ERRO_DESCONHECIDO';
                    $acao     = 'Verifique os logs e tente novamente.';

                    if ($isNetworkError) {
                        $tipoErro = 'ERRO_REDE';
                        $acao     = 'SEFAZ indisponível ou problema de rede. Tente novamente em alguns minutos.';
                    } elseif ($isSoapFault) {
                        $tipoErro = 'ERRO_SOAP';
                        $acao     = 'A SEFAZ retornou um erro SOAP. Verifique se o serviço de DF-e está disponível para a UF configurada.';
                    } elseif ($isAuthError) {
                        $tipoErro = 'ERRO_AUTENTICACAO';
                        $acao     = 'O certificado digital não foi aceito pela SEFAZ. Verifique a validade e se o CNPJ está habilitado para DF-e.';
                    }

                    $this->diag['requisicao'] = [
                        'tentativas'   => $attemptsMade,
                        'tempoMs'      => $reqElapsedMs,
                    ];

                    $this->diag['erro'] = [
                        'tipo'       => $tipoErro,
                        'mensagem'   => $msg,
                        'acao'       => $acao,
                        'stackTrace' => $e->getTraceAsString(),
                        'tentativa'  => $attempt,
                    ];

                    $this->addEtapa('REQUISICAO', $tipoErro, "{$msg} | Ação: {$acao}");
                    return $this->buildResponse([], '0', '0', null, null, $startMs);
                }
            }

            // ── ETAPA 4: Parse da resposta ─────────────────────────────────
            $this->addEtapa('PARSE', 'PROCESSANDO_RESPOSTA');

            // Guardar XML bruto (truncado se muito grande para não sobrecarregar)
            $xmlTruncado = strlen($response) > 10000 ? substr($response, 0, 10000) . '...[TRUNCADO]' : $response;
            $this->diag['resposta'] = [
                'xmlBrutoTamanho' => strlen($response),
                'xmlBruto'        => $xmlTruncado,
            ];

            $parsed = $this->parseDistribuicaoResponse($response);

            $cStat   = $parsed['cStat']   ?? null;
            $xMotivo = $parsed['mensagem'] ?? null;

            $this->diag['resultado'] = [
                'cStat'           => $cStat,
                'xMotivo'         => $xMotivo,
                'documentosTotal' => count($parsed['documentos'] ?? []),
                'ultNSU'          => $parsed['ultNSU'] ?? '0',
                'maxNSU'          => $parsed['maxNSU'] ?? '0',
            ];

            // Classificar o resultado
            $this->classificarResultado($cStat, $xMotivo, count($parsed['documentos'] ?? []));

            return $this->buildResponse(
                $parsed['documentos'] ?? [],
                $parsed['ultNSU'] ?? '0',
                $parsed['maxNSU'] ?? '0',
                $cStat,
                $xMotivo,
                $startMs
            );

        } catch (\Throwable $e) {
            $this->diag['erro'] = [
                'tipo'       => 'ERRO_FATAL',
                'mensagem'   => $e->getMessage(),
                'acao'       => 'Erro inesperado no processo de distribuição. Verifique os logs.',
                'stackTrace' => $e->getTraceAsString(),
                'arquivo'    => $e->getFile() . ':' . $e->getLine(),
            ];
            $this->addEtapa('FATAL', 'ERRO_FATAL', $e->getMessage());
            return $this->buildResponse([], '0', '0', null, null, $startMs);
        }
    }

    /**
     * Baixa o XML completo de uma NF-e pela chave de acesso via DF-e.
     */
    public function downloadXml(array $payload): array
    {
        $empresa = $payload['empresa'];
        $certB64 = $payload['certPfxBase64'] ?? '';
        $senha   = $payload['certSenha']     ?? '';
        $chave   = $payload['chave']         ?? '';
        $amb     = (int) ($empresa['ambiente'] ?? 2);

        if (empty($chave) || strlen($chave) !== 44) {
            throw new \InvalidArgumentException('Chave de acesso inválida (deve ter 44 dígitos).');
        }

        $certPfx     = base64_decode($certB64);
        $certificate = Certificate::readPfx($certPfx, $senha);

        $config = json_encode([
            'atualizacao' => date('Y-m-d H:i:s'),
            'tpAmb'       => $amb,
            'razaosocial' => $empresa['razaoSocial'] ?? '',
            'cnpj'        => preg_replace('/\D/', '', $empresa['cnpj'] ?? ''),
            'siglaUF'     => $empresa['endereco']['uf'] ?? 'SP',
            'schemes'     => 'PL_009_V4',
            'versao'      => '4.00',
            'tokenIBPT'   => '',
            'CSC'         => $empresa['csc']   ?? '',
            'CSCid'       => $empresa['idCsc'] ?? '',
        ]);

        $tools = new Tools($config, $certificate);
        $tools->model(55);

        $soap = new SoapCurl($certificate);
        $soap->disableCertValidation(true);
        $soap->httpVersion('1.1');
        $soap->setSecurityLevel(true);
        $soap->loadCA('/etc/ssl/certs/ca-certificates.crt');
        $tools->loadSoapClass($soap);

        $maxAttempts = 3;
        $response    = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = $tools->sefazDistDFe(0, '', $chave);
                break;
            } catch (\Exception $e) {
                $msg = $e->getMessage();
                $isNetworkError = stripos($msg, 'SSL_ERROR_SYSCALL') !== false
                    || stripos($msg, 'timeout') !== false
                    || stripos($msg, 'connection') !== false;

                if ($isNetworkError && $attempt < $maxAttempts) {
                    usleep(500000 * $attempt);
                    continue;
                }
                throw $e;
            }
        }

        $parsed = $this->parseDistribuicaoResponse($response);

        if (!empty($parsed['documentos'])) {
            $doc = $parsed['documentos'][0];
            return [
                'chave' => $doc['chave'] ?? $chave,
                'xml'   => $doc['xml']   ?? '',
                'schema'=> $doc['schema']?? '',
                'nsu'   => $doc['nsu']   ?? '',
            ];
        }

        return [
            'chave'   => $chave,
            'xml'     => '',
            'mensagem'=> 'XML não encontrado para a chave informada.',
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    //  MÉTODOS PRIVADOS
    // ═══════════════════════════════════════════════════════════════════

    private function validarCertificado(string $certB64, string $senha): array
    {
        $certPfx = base64_decode($certB64);
        if (empty($certPfx)) {
            throw new \RuntimeException('Certificado PFX vazio ou base64 inválido.');
        }

        $certData = [];
        if (!openssl_pkcs12_read($certPfx, $certData, $senha)) {
            $err = openssl_error_string() ?: 'Senha incorreta ou arquivo corrompido';
            throw new \RuntimeException("Falha ao ler certificado PFX: {$err}");
        }

        // Extrair detalhes do certificado
        $x509 = openssl_x509_parse($certData['cert']);
        $cn   = $x509['subject']['CN'] ?? 'N/A';
        $serial = $x509['serialNumberHex'] ?? ($x509['serialNumber'] ?? 'N/A');

        $validFrom  = isset($x509['validFrom_time_t']) ? date('Y-m-d H:i:s', $x509['validFrom_time_t']) : 'N/A';
        $validTo    = isset($x509['validTo_time_t'])   ? date('Y-m-d H:i:s', $x509['validTo_time_t'])   : 'N/A';

        $diasRestantes = 0;
        $expirado = false;
        if (isset($x509['validTo_time_t'])) {
            $diasRestantes = (int) ceil(($x509['validTo_time_t'] - time()) / 86400);
            $expirado = $diasRestantes <= 0;
        }

        $issuer = $x509['issuer']['CN'] ?? ($x509['issuer']['O'] ?? 'N/A');

        return [
            'cn'             => $cn,
            'serial'         => $serial,
            'validoDe'       => $validFrom,
            'validoAte'      => $validTo,
            'diasRestantes'  => $diasRestantes,
            'expirado'       => $expirado,
            'emissora'       => $issuer,
            'carregado'      => true,
        ];
    }

    private function classificarResultado(?string $cStat, ?string $xMotivo, int $qtdDocs): void
    {
        $statusMap = [
            '137' => ['status' => 'NENHUM_DOCUMENTO', 'descricao' => 'Nenhum documento localizado para o CNPJ/NSU informado.'],
            '138' => ['status' => 'DOCUMENTOS_LOCALIZADOS', 'descricao' => "Foram localizados {$qtdDocs} documento(s)."],
            '656' => ['status' => 'CONSUMO_INDEVIDO', 'descricao' => 'Limite de consultas atingido. Aguarde antes de tentar novamente.'],
            '593' => ['status' => 'CNPJ_NAO_HABILITADO', 'descricao' => 'CNPJ não está habilitado para consulta DF-e na SEFAZ. Entre em contato com a Secretaria da Fazenda do seu estado.'],
            '108' => ['status' => 'SEFAZ_MANUTENCAO', 'descricao' => 'Serviço da SEFAZ em parada programada.'],
            '109' => ['status' => 'SEFAZ_EMERGENCIA', 'descricao' => 'Serviço da SEFAZ em parada emergencial.'],
        ];

        if ($cStat !== null && isset($statusMap[$cStat])) {
            $info = $statusMap[$cStat];
            $this->addEtapa('RESULTADO', $info['status'], $info['descricao']);
        } elseif ($cStat !== null) {
            $this->addEtapa('RESULTADO', 'RESPOSTA_SEFAZ',
                "cStat={$cStat} | {$xMotivo}");
        } else {
            $this->addEtapa('RESULTADO', 'RESPOSTA_SEM_CSTAT',
                'A resposta da SEFAZ não contém um código de status válido.');
        }
    }

    private function buildResponse(array $documentos, string $ultNSU, string $maxNSU, ?string $cStat, ?string $mensagem, int $startNs): array
    {
        $tempoTotalMs = (int)((hrtime(true) - $startNs) / 1e6);
        $this->diag['tempoTotalMs'] = $tempoTotalMs;

        // Logar no error_log do Apache para rastreamento
        $corrId = $this->diag['correlationId'];
        $status = $this->diag['statusInterno'];
        $certCn = $this->diag['certificado']['cn'] ?? 'N/A';
        error_log("[{$corrId}] DF-e | Status: {$status} | cStat: {$cStat} | Docs: " . count($documentos) . " | Cert: {$certCn} | Tempo: {$tempoTotalMs}ms");

        return [
            'documentos'   => $documentos,
            'ultNSU'       => $ultNSU,
            'maxNSU'       => $maxNSU,
            'cStat'        => $cStat,
            'mensagem'     => $mensagem,
            'diagnostico'  => $this->diag,
        ];
    }

    private function maskCnpj(string $cnpj): string
    {
        if (strlen($cnpj) !== 14) return $cnpj;
        return substr($cnpj, 0, 4) . '****' . substr($cnpj, 8, 2) . '****';
    }

    private function parseDistribuicaoResponse(string $response): array
    {
        // Remover namespaces XML da SEFAZ para permitir acesso direto aos elementos
        $cleanResponse = preg_replace('/xmlns[^=]*="[^"]*"/', '', $response);
        $cleanResponse = preg_replace('/(<\/?)([a-zA-Z]+):/', '$1', $cleanResponse);

        $xml = simplexml_load_string($cleanResponse);

        if ($xml === false) {
            error_log("[DF-e Parser] Falha ao parsear XML. Tamanho bruto: " . strlen($response) . " bytes.");
            return ['documentos' => [], 'ultNSU' => '0', 'maxNSU' => '0', 'cStat' => null, 'mensagem' => 'Resposta XML inválida'];
        }

        // Navegar pelo SOAP Envelope até o nó retDistDFeInt
        // Estrutura: Envelope → Body → nfeDistDFeInteresseResponse → nfeDistDFeInteresseResult → retDistDFeInt
        $retNode = $xml;

        // Tentar navegar pela estrutura SOAP completa
        if (isset($xml->Body->nfeDistDFeInteresseResponse->nfeDistDFeInteresseResult->retDistDFeInt)) {
            $retNode = $xml->Body->nfeDistDFeInteresseResponse->nfeDistDFeInteresseResult->retDistDFeInt;
            error_log("[DF-e Parser] Navegou SOAP Envelope até retDistDFeInt com sucesso.");
        } elseif (isset($xml->Body)) {
            // Tentar acessar o primeiro filho do Body recursivamente
            foreach ($xml->Body->children() as $resp) {
                foreach ($resp->children() as $result) {
                    foreach ($result->children() as $ret) {
                        if ($ret->getName() === 'retDistDFeInt' || isset($ret->cStat)) {
                            $retNode = $ret;
                            error_log("[DF-e Parser] Encontrou retDistDFeInt por iteração recursiva.");
                            break 3;
                        }
                    }
                }
            }
        } elseif (isset($xml->retDistDFeInt)) {
            $retNode = $xml->retDistDFeInt;
        }

        $cStat   = (string) ($retNode->cStat   ?? '');
        $xMotivo = (string) ($retNode->xMotivo ?? '');
        $ultNSU  = (string) ($retNode->ultNSU  ?? '0');
        $maxNSU  = (string) ($retNode->maxNSU  ?? '0');

        // Limpar zeros à esquerda do NSU para comparação, mas manter o original
        $ultNSUClean = ltrim($ultNSU, '0') ?: '0';
        $maxNSUClean = ltrim($maxNSU, '0') ?: '0';

        error_log("[DF-e Parser] cStat={$cStat} | xMotivo={$xMotivo} | ultNSU={$ultNSUClean} | maxNSU={$maxNSUClean}");

        if ($cStat === '137') {
            return [
                'documentos' => [],
                'ultNSU'     => $ultNSU,
                'maxNSU'     => $maxNSU,
                'cStat'      => $cStat,
                'mensagem'   => $xMotivo ?: 'Nenhum documento encontrado.',
            ];
        }

        $documentos = [];

        if (isset($retNode->loteDistDFeInt->docZip)) {
            foreach ($retNode->loteDistDFeInt->docZip as $docZip) {
                $attrs   = $docZip->attributes();
                $nsu     = (string) ($attrs['NSU']    ?? '');
                $schema  = (string) ($attrs['schema'] ?? '');

                $xmlContent = '';
                $decoded = base64_decode((string) $docZip);
                if ($decoded !== false) {
                    $decompressed = @gzdecode($decoded);
                    $xmlContent = $decompressed !== false ? $decompressed : '';
                }

                $chave = '';
                if ($schema === 'resNFe_v1.01.xsd') {
                    $cleanDoc = preg_replace('/xmlns[^=]*="[^"]*"/', '', $xmlContent);
                    $docXml = @simplexml_load_string($cleanDoc);
                    $chave  = (string) ($docXml->chNFe ?? '');
                } elseif (str_contains($schema, 'procNFe')) {
                    if (preg_match('/Id="NFe(\d{44})"/', $xmlContent, $m)) {
                        $chave = $m[1];
                    }
                }

                $documentos[] = [
                    'nsu'    => $nsu,
                    'schema' => $schema,
                    'chave'  => $chave,
                    'xml'    => $xmlContent,
                ];
            }
        }

        return [
            'documentos' => $documentos,
            'ultNSU'     => $ultNSU,
            'maxNSU'     => $maxNSU,
            'cStat'      => $cStat,
            'mensagem'   => $xMotivo,
        ];
    }
}
