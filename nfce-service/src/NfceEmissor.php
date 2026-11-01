<?php
declare(strict_types=1);

namespace App;

use NFePHP\NFe\Make;
use NFePHP\NFe\Tools;
use NFePHP\Common\Certificate;
use NFePHP\Common\Soap\SoapCurl;

/**
 * NfceEmissor — Encapsula toda a lógica de montagem e envio da NFC-e via sped-nfe.
 *
 * Referências:
 *  - SEFAZ-RS Nota Técnica NFC-e
 *  - nfephp-org/sped-nfe (https://github.com/nfephp-org/sped-nfe)
 *  - Tabela CSOSN (Simples Nacional)
 *  - Tabela tPag SEFAZ (5.4)
 */
class NfceEmissor
{
    public function emitir(array $payload): array
    {
        $empresa = $payload['empresa'];
        $nota    = $payload['nota'];
        $certB64 = $payload['certPfxBase64'] ?? '';
        $senha   = $payload['certSenha']     ?? '';
        $amb     = (int) ($empresa['ambiente'] ?? 2); // 1=Prod, 2=Homo

        // ── Proteção: nunca emitir em produção sem certificado ────────────────
        if ($amb === 1 && empty($certB64)) {
            throw new \RuntimeException('Certificado obrigatório para ambiente de produção.');
        }

        // ── Validação prévia do certificado PFX ───────────────────────────────
        // Garante que o arquivo PFX é legível antes de qualquer chamada de rede.
        $certPfx = base64_decode($certB64);
        if (empty($certPfx)) {
            throw new \RuntimeException('Certificado PFX inválido ou não fornecido (base64 vazio).');
        }

        $certData = [];
        if (!openssl_pkcs12_read($certPfx, $certData, $senha)) {
            $opensslErr = openssl_error_string() ?: 'Senha incorreta ou arquivo corrompido';
            throw new \RuntimeException("Falha ao ler certificado PFX: {$opensslErr}");
        }

        // ── Configuração do sped-nfe ──────────────────────────────────────────
        $config      = $this->buildConfig($empresa, $amb);
        $certificate = Certificate::readPfx($certPfx, $senha);

        $tools = new Tools($config, $certificate);
        $tools->model(65); // NFC-e
        // SEFAZ SP exige QR Code versão 2 (chave|2|tpAmb|cIdToken|SHA1_CSC)
        // A biblioteca por padrão gera versão 3 (NT 2025.002, sem CSC no hash)
        // → versão 3 não inclui CSC no QR Code → SEFAZ não identifica emitente → Rejeição 245
        $tools->forceQRCodeVersion('200');

        // ── Configuração do SoapCurl via API nativa do NFePHP ────────────────
        //
        // CAUSA RAIZ (confirmada pelo diagnóstico):
        //   $httpver = 0 (CURL_HTTP_VERSION_NONE) → cURL negocia HTTP/2 via ALPN
        //   SVRS rejeita HTTP/2 com TCP RST → SSL_ERROR_SYSCALL
        //   StreamSocket e cURL HTTP/1.1 → funcionam (confirmado: HTTP 200)
        //
        // SOLUÇÃO: SoapBase expõe httpVersion() e setSecurityLevel() publicamente.
        // Não é necessário Reflection — são métodos da API oficial do NFePHP.
        $soap = new SoapCurl($certificate);
        $soap->disableCertValidation(true);       // desativa verificação CA chain SEFAZ
        $soap->httpVersion('1.1');                // força HTTP/1.1 → sem ALPN h2
        $soap->setSecurityLevel(true);            // DEFAULT@SECLEVEL=1 → aceita ICP-Brasil
        $soap->loadCA('/etc/ssl/certs/ca-certificates.crt'); // CA bundle com ICP-Brasil
        $soap->timeout(60);                       // 60s + 20 = 80s total — SEFAZ SP pode ser lenta
        $tools->loadSoapClass($soap);


        // ── Montagem do XML ───────────────────────────────────────────────────
        // PL_010_V1 = schema 10 = habilita a tag IBSCBS (Reforma Tributária NT2025.002)
        $make = new Make('PL_010_V1');
        $this->montarInfNFe($make, $empresa, $nota, $amb);

        $xml = $make->getXML();

        // ── Assinar (validação XSD desabilitada — SEFAZ valida autoritativamente) ──────
        $xmlAssinado = $tools->signNFe($xml, 0);

        // ── Enviar à SEFAZ (indSinc = 1 para envio síncrono — exigido para lote de 1 nota) ──
        $maxAttempts = 3;
        $attempt = 1;
        $response = null;
        $ufEnvio = $empresa['endereco']['uf'] ?? 'SP';
        error_log("NfceEmissor: UF={$ufEnvio} | Amb={$amb} | Iniciando envio...");

        while ($attempt <= $maxAttempts) {
            try {
                $idLote = str_pad('1', 15, '0', STR_PAD_LEFT);
                $resp = $tools->sefazEnviaLote([$xmlAssinado], $idLote, 1, false);
                error_log("SEFAZ RESPONSE: " . $resp);
                $response = $resp;
                error_log("NfceEmissor: Resposta SEFAZ recebida na tentativa {$attempt}");
                break; // Sucesso, sai do loop
            } catch (\Exception $e) {
                $msg = $e->getMessage();
                $isNetworkError = stripos($msg, 'SSL_ERROR_SYSCALL') !== false
                    || stripos($msg, 'SSL_connect') !== false
                    || stripos($msg, 'connection') !== false
                    || stripos($msg, 'timeout') !== false
                    || stripos($msg, 'couldn\'t connect') !== false
                    || stripos($msg, 'resolved') !== false;

                if ($isNetworkError && $attempt < $maxAttempts) {
                    error_log("NfceEmissor: Falha de rede temporária na tentativa {$attempt} de {$maxAttempts}. Erro: {$msg}. Retentando em 500ms...");
                    usleep(500000); // 500ms
                    $attempt++;
                    continue;
                }
                throw $e;
            }
        }

        $responseArr = $this->parseResponse($response);

        // ── Processar retorno ─────────────────────────────────────────────────
        if (($responseArr['cStat'] ?? '') === '104' || ($responseArr['cStat'] ?? '') === '100') {
            $chave = $responseArr['chNFe'] ?? '';
            $nProt = $responseArr['nProt'] ?? '';

            // Monta o XML autorizado com o protocolo SEFAZ anexado
            try {
                $xmlAutorizado = \NFePHP\NFe\Complements::toAuthorize($xmlAssinado, $response);
            } catch (\Exception $e) {
                $xmlAutorizado = $xmlAssinado; // fallback
            }

            $qrcode = $this->gerarQrCodeUrl($make, $empresa, $nota, $nProt, $amb);

            return [
                'status'    => 'autorizada',
                'chave'     => $chave,
                'protocolo' => $nProt,
                'numero'    => (int) $nota['numero'],
                'xml'       => $xmlAutorizado,
                'qrcode'    => $qrcode,
            ];
        }

        // Rejeitada pela SEFAZ
        file_put_contents('/tmp/debug_rejeitado.xml', $xmlAssinado);
        return [
            'status'         => 'rejeitada',
            'codRejeicao'    => $responseArr['cStat']   ?? '999',
            'motivoRejeicao' => $responseArr['xMotivo'] ?? 'Rejeição desconhecida',
        ];
    }

    // ─── Configuração JSON para o sped-nfe ──────────────────────────────────
    private function buildConfig(array $empresa, int $amb): string
    {
        return json_encode([
            "atualizacao" => date('Y-m-d H:i:s'),
            "tpAmb"       => $amb,
            "razaosocial" => $empresa['razaoSocial']  ?? '',
            "cnpj"        => preg_replace('/\D/', '', $empresa['cnpj'] ?? ''),
            "siglaUF"     => $empresa['endereco']['uf'] ?? 'SP',
            // PL_009: gera QR Code v2 (chave|2|tpAmb|cIdToken|SHA1) — exigido pelo SEFAZ SP
            // PL_010_V1 gera QR Code v3 (chave|3|tpAmb) sem CSC → SEFAZ retorna erro 245
            "schemes"     => "PL_009",
            "versao"      => "4.00",
            "tokenIBPT"   => "",
            "CSC"         => $empresa['csc']   ?? '',
            "CSCid"       => $empresa['idCsc'] ?? '',
        ]);
    }

    // ─── Montagem dos elementos do XML NFC-e ─────────────────────────────────
    private function montarInfNFe(Make $make, array $empresa, array $nota, int $amb): void
    {
        $end    = $empresa['endereco'];
        $numero = (int) $nota['numero'];
        $serie  = (int) ($empresa['serie'] ?? 1);
        $crt    = (int) ($empresa['crt']   ?? 1);
        $cnpj   = preg_replace('/\D/', '', $empresa['cnpj'] ?? '');

        // INFNFE
        $make->taginfNFe((object) [
            'versao'   => '4.00',
            'Id'       => '',
            'pk_nItem' => null,
        ]);

        $cMun = $end['codMunicipio'] ?? '3506003';
        $cUF  = substr($cMun, 0, 2);

        // IDE
        $make->tagide((object) [
            'cUF'      => $cUF,
            'cNF'      => str_pad((string) rand(10000000, 99999999), 8, '0', STR_PAD_LEFT),
            'natOp'    => 'VENDA A CONSUMIDOR',
            'mod'      => '65',  // NFC-e
            'serie'    => $serie,
            'nNF'      => $numero,
            'dhEmi'    => date('Y-m-d\TH:i:sP'),
            'tpNF'     => '1',   // Saída
            'idDest'   => '1',   // Operação interna
            'cMunFG'   => $end['codMunicipio'] ?? '3506003',
            'tpImp'    => '4',   // DANFE NFC-e
            'tpEmis'   => $nota['tpEmis'] ?? '1',
            'cDV'      => '0',
            'tpAmb'    => $amb,
            'finNFe'   => '1',
            'indFinal' => '1',   // Consumidor final
            'indPres'  => '1',   // Operação presencial
            'procEmi'  => '0',
            'verProc'  => '7bar-1.0',
        ]);

        // EMIT (Emitente)
        $make->tagemit((object) [
            'CNPJ'  => $cnpj,
            'xNome' => $empresa['razaoSocial']  ?? '',
            'xFant' => $empresa['nomeFantasia'] ?? '',
            'IE'    => preg_replace('/\D/', '', $empresa['ie'] ?? ''),
            'CRT'   => $crt,
        ]);

        $make->tagenderEmit((object) [
            'xLgr'    => $end['logradouro']   ?? '',
            'nro'     => $end['numero']        ?? 'S/N',
            'xBairro' => $end['bairro']        ?? '',
            'cMun'    => $end['codMunicipio']  ?? '3506003',
            'xMun'    => $end['municipio']     ?? '',
            'UF'      => $end['uf']            ?? 'SP',
            'CEP'     => preg_replace('/\D/', '', $end['cep'] ?? ''),
            'cPais'   => '1058',
            'xPais'   => 'Brasil',
            'fone'    => preg_replace('/\D/', '', $end['telefone'] ?? ''),
        ]);

        // DEST (Consumidor — anônimo por padrão em NFC-e)
        $cpf = $nota['consumidor']['cpf'] ?? '';
        if ($cpf) {
            $make->tagdest((object) [
                'CPF'       => preg_replace('/\D/', '', $cpf),
                'xNome'     => $nota['consumidor']['nome'] ?? 'CONSUMIDOR',
                'indIEDest' => '9',
            ]);
        }

        // ITENS
        $totalProd = 0.0;
        foreach ($nota['itens'] as $item) {
            $totalProd += round((float) $item['quantidade'] * (float) $item['valorUnit'], 2);
        }

        $totalDesc = (float) ($nota['desconto'] ?? 0);
        $accumulatedDesc = 0.0;
        $totalItems = count($nota['itens']);

        foreach ($nota['itens'] as $idx => $item) {
            $itemNum  = $idx + 1;
            $subtotal = round((float) $item['quantidade'] * (float) $item['valorUnit'], 2);

            // Rateio do desconto global nos itens para validação SEFAZ (rejeição 535)
            $itemDesc = 0.0;
            if ($totalDesc > 0 && $totalProd > 0) {
                if ($itemNum === $totalItems) {
                    $itemDesc = round($totalDesc - $accumulatedDesc, 2);
                } else {
                    $itemDesc = round(($subtotal / $totalProd) * $totalDesc, 2);
                    $accumulatedDesc += $itemDesc;
                }
            }

            if ($itemDesc > $subtotal) {
                $itemDesc = $subtotal;
            }

            $vBCItem = round($subtotal - $itemDesc, 2);

            $barcodeVal = (!empty($item['barcode']) && $item['barcode'] !== 'SEM GTIN') ? trim($item['barcode']) : 'SEM GTIN';

            $rawNcm = preg_replace('/\D/', '', (string) ($item['ncm'] ?? ''));
            $ncmVal = (strlen($rawNcm) === 8) ? $rawNcm : '22030000';

            $rawCfop = preg_replace('/\D/', '', (string) ($item['cfop'] ?? ''));
            $cfopVal = (strlen($rawCfop) === 4) ? $rawCfop : '5102';

            $make->tagprod((object) [
                'item'     => $itemNum,
                'cProd'    => $item['produtoId'] ?? "PROD{$itemNum}",
                'cEAN'     => $barcodeVal,
                'xProd'    => mb_substr($item['xProd'], 0, 120),
                'NCM'      => $ncmVal,
                'CEST'     => !empty($item['cest']) ? preg_replace('/\D/', '', (string) $item['cest']) : null,
                'CFOP'     => $cfopVal,
                'uCom'     => $item['unit'] ?? 'UN',
                'qCom'     => number_format((float) $item['quantidade'], 4, '.', ''),
                'vUnCom'   => number_format((float) $item['valorUnit'], 4, '.', ''),
                'vProd'    => number_format($subtotal, 2, '.', ''),
                'cEANTrib' => $barcodeVal,
                'uTrib'    => $item['unit'] ?? 'UN',
                'qTrib'    => number_format((float) $item['quantidade'], 4, '.', ''),
                'vUnTrib'  => number_format((float) $item['valorUnit'], 4, '.', ''),
                'vDesc'    => $itemDesc > 0 ? number_format($itemDesc, 2, '.', '') : null,
                'indTot'   => '1',
            ]);

            // Imposto — ICMS
            if ($crt === 1 || $crt === 2) {
                // Simples Nacional
                $make->tagICMSSN((object) [
                    'item'  => $itemNum,
                    'orig'  => (string) ($item['origem'] ?? '0'),
                    'CSOSN' => $item['csosn'] ?? '102',
                ]);
            } else {
                // Regime Normal
                $make->tagICMS((object) [
                    'item'  => $itemNum,
                    'orig'  => (string) ($item['origem'] ?? '0'),
                    'CST'   => $item['cstIcms'] ?? '00',
                    'modBC' => '3',
                    'vBC'   => number_format($vBCItem, 2, '.', ''),
                    'pICMS' => number_format((float) ($item['aliqIcms'] ?? 0), 2, '.', ''),
                    'vICMS' => number_format($vBCItem * ($item['aliqIcms'] ?? 0) / 100, 2, '.', ''),
                ]);
            }

            // PIS
            $make->tagPIS((object) [
                'item' => $itemNum,
                'CST'  => $item['cstPis'] ?? '99',
                'vBC'  => '0.00', 'pPIS' => '0.00', 'vPIS' => '0.00',
            ]);

            // COFINS
            $make->tagCOFINS((object) [
                'item'    => $itemNum,
                'CST'     => $item['cstCofins'] ?? '99',
                'vBC'     => '0.00', 'pCOFINS' => '0.00', 'vCOFINS' => '0.00',
            ]);

            $pIBSUF  = '0.1000'; // 0.10% — aceito pelo SEFAZ SP
            $pIBSMun = '0.0000'; // 0.00% — exigido em 2026
            $pCBS    = '0.9000'; // 0.90%
            $vBC     = number_format($vBCItem, 2, '.', '');
            $vIBSUF  = number_format($vBCItem * 0.001,  2, '.', '');
            $vIBSMun = '0.00';
            $vCBS    = number_format($vBCItem * 0.009,  2, '.', '');
            $vIBS    = $vIBSUF;
            $make->tagIBSCBS((object) [
                'item'            => $itemNum,
                'CST'             => '000',
                'cClassTrib'      => '000001',
                'vBC'             => $vBC,
                'gIBSUF_pIBSUF'   => $pIBSUF,
                'gIBSMun_pIBSMun' => $pIBSMun,
                'gCBS_pCBS'       => $pCBS,
                'gIBSUF_vIBSUF'   => $vIBSUF,
                'gIBSMun_vIBSMun' => $vIBSMun,
                'gCBS_vCBS'       => $vCBS,
                'vIBS'            => $vIBS,
            ]);





        }

        // TOTAL
        $totalDesc = (float) ($nota['desconto'] ?? 0);
        $totalNota = round($totalProd - $totalDesc, 2);

        $make->tagICMSTot((object) [
            'vBC'       => '0.00', 'vICMS'    => '0.00', 'vICMSDeson' => '0.00',
            'vFCP'      => '0.00', 'vBCST'    => '0.00', 'vST'        => '0.00',
            'vFCPST'    => '0.00', 'vFCPSTRet'=> '0.00',
            'vProd'     => number_format($totalProd, 2, '.', ''),
            'vFrete'    => '0.00', 'vSeg'     => '0.00',
            'vDesc'     => number_format($totalDesc, 2, '.', ''),
            'vII'       => '0.00', 'vIPI'     => '0.00', 'vIPIDevol' => '0.00',
            'vPIS'      => '0.00', 'vCOFINS'  => '0.00', 'vOutro'    => '0.00',
            'vNF'       => number_format($totalNota, 2, '.', ''),
        ]);

        // TRANSPORTE (sem frete — venda balcão)
        $make->tagtransp((object) ['modFrete' => '9']);

        // PAGAMENTOS
        $totalPago = 0;
        foreach ($nota['pagamentos'] as $pag) {
            $vPag       = (float) $pag['valor'];
            $totalPago += $vPag;

            $detPag = [
                'tPag' => $pag['tPag'],
                'vPag' => number_format($vPag, 2, '.', ''),
            ];

            // Cartão crédito (03), débito (04) ou Pix (17) exige grupo de integração
            if (in_array($pag['tPag'], ['03', '04', '17'], true)) {
                $detPag['tpIntegra'] = 2; // Não integrado com sistema do caixa (POS/QR Code avulso)
            }

            $make->tagdetPag((object) $detPag);
        }

        // Troco
        $troco = max(0, $totalPago - $totalNota);
        $make->tagpag((object) ['vTroco' => number_format($troco, 2, '.', '')]);

        // INFORMAÇÕES ADICIONAIS (obrigatório Simples Nacional)
        if ($crt === 1) {
            $make->taginfAdic((object) ['infCpl' => 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Nao gera direito a credito fiscal de ICMS, de ISS e de IPI.']);
        }
    }

    private function gerarQrCodeUrl(Make $make, array $empresa, array $nota, string $nProt, int $amb): string
    {
        $base = $amb === 1
            ? 'https://www.nfce.fazenda.sp.gov.br/consulta'
            : 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta';

        return $base . '?chNFe=' . ($nota['chave'] ?? '');
    }

    private function parseResponse(string $response): array
    {
        if (preg_match('/<retEnviNFe[^>]*>(.*?)<\/retEnviNFe>/s', $response, $matches)) {
            $innerXml = '<retEnviNFe>' . $matches[1] . '</retEnviNFe>';
            $xml      = simplexml_load_string($innerXml);
        } else {
            $xml = simplexml_load_string($response);
        }

        if ($xml === false) {
            $snippet = mb_substr(strip_tags($response), 0, 150);
            return ['cStat' => '999', 'xMotivo' => 'Resposta inválida da SEFAZ. Detalhe: ' . ($snippet ?: 'Vazio')];
        }

        if (isset($xml->protNFe->infProt)) {
            $cStat   = (string) $xml->protNFe->infProt->cStat;
            $xMotivo = (string) $xml->protNFe->infProt->xMotivo;
            $chNFe   = (string) $xml->protNFe->infProt->chNFe;
            $nProt   = (string) $xml->protNFe->infProt->nProt;
        } else {
            $cStat   = (string) ($xml->cStat   ?? '999');
            $xMotivo = (string) ($xml->xMotivo ?? 'Erro desconhecido');
            $chNFe   = '';
            $nProt   = '';
        }

        return [
            'cStat'   => $cStat,
            'xMotivo' => $xMotivo,
            'chNFe'   => $chNFe,
            'nProt'   => $nProt,
        ];
    }

    private function parseProtocolo(string $consulta): array
    {
        $xml = simplexml_load_string($consulta);
        if (!$xml) return ['nProt' => ''];

        return [
            'nProt' => (string) ($xml->protNFe->infProt->nProt ?? ''),
            'cStat' => (string) ($xml->protNFe->infProt->cStat ?? ''),
        ];
    }
}
