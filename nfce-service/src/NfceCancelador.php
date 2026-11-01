<?php
declare(strict_types=1);

namespace App;

use NFePHP\NFe\Tools;
use NFePHP\Common\Certificate;
use NFePHP\Common\Soap\SoapCurl;

/**
 * NfceCancelador — Encapsula o cancelamento de NFC-e via sped-nfe.
 *
 * Fluxo:
 *  1. Valida o certificado A1
 *  2. Configura o sped-nfe (mesmo padrão do NfceEmissor)
 *  3. Chama sefazCancela (evento 110111)
 *  4. Retorna status, protocolo e data do evento
 */
class NfceCancelador
{
    public function cancelar(array $payload): array
    {
        $empresa  = $payload['empresa'];
        $certB64  = $payload['certPfxBase64'] ?? '';
        $senha    = $payload['certSenha']     ?? '';
        $chave    = $payload['chave']         ?? '';
        $protocolo = $payload['protocolo']    ?? '';
        $motivo   = $payload['motivo']        ?? 'Cancelamento solicitado pelo emitente';
        $amb      = (int) ($empresa['ambiente'] ?? 2);

        // ── Validações ────────────────────────────────────────────────────────
        if (empty($chave) || strlen($chave) !== 44) {
            throw new \InvalidArgumentException('Chave de acesso inválida (deve ter 44 dígitos).');
        }
        if (empty($protocolo)) {
            throw new \InvalidArgumentException('Protocolo de autorização é obrigatório para cancelamento.');
        }
        if (mb_strlen($motivo) < 15) {
            throw new \InvalidArgumentException('Motivo do cancelamento deve ter pelo menos 15 caracteres.');
        }

        // ── Certificado ───────────────────────────────────────────────────────
        $certPfx = base64_decode($certB64);
        if (empty($certPfx)) {
            throw new \RuntimeException('Certificado PFX inválido ou não fornecido.');
        }
        $certData = [];
        if (!openssl_pkcs12_read($certPfx, $certData, $senha)) {
            $err = openssl_error_string() ?: 'Senha incorreta ou arquivo corrompido';
            throw new \RuntimeException("Falha ao ler certificado PFX: {$err}");
        }

        // ── Configurar sped-nfe ───────────────────────────────────────────────
        $config      = $this->buildConfig($empresa, $amb);
        $certificate = Certificate::readPfx($certPfx, $senha);
        $tools       = new Tools($config, $certificate);
        $tools->model(65);

        $soap = new SoapCurl($certificate);
        $soap->disableCertValidation(true);
        $soap->httpVersion('1.1');
        $soap->setSecurityLevel(true);
        $soap->loadCA('/etc/ssl/certs/ca-certificates.crt');
        $tools->loadSoapClass($soap);

        // ── Enviar cancelamento ───────────────────────────────────────────────
        $xJust   = mb_substr($motivo, 0, 255);
        $nSeqEvento = '1';

        $maxAttempts = 3;
        $response    = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = $tools->sefazCancela($chave, $xJust, $protocolo);
                break;
            } catch (\Exception $e) {
                $msg = $e->getMessage();
                $isNetworkError = stripos($msg, 'SSL_ERROR_SYSCALL') !== false
                    || stripos($msg, 'timeout') !== false
                    || stripos($msg, 'connection') !== false;

                if ($isNetworkError && $attempt < $maxAttempts) {
                    $sleepMs = 500 * (2 ** ($attempt - 1)); // backoff exponencial: 500ms, 1000ms
                    error_log("NfceCancelador: Tentativa {$attempt} falhou. Retentando em {$sleepMs}ms.");
                    usleep($sleepMs * 1000);
                    continue;
                }
                throw $e;
            }
        }

        return $this->parseResponse($response, $chave);
    }

    private function buildConfig(array $empresa, int $amb): string
    {
        return json_encode([
            'atualizacao' => date('Y-m-d H:i:s'),
            'tpAmb'       => $amb,
            'razaosocial' => $empresa['razaoSocial']  ?? '',
            'cnpj'        => preg_replace('/\D/', '', $empresa['cnpj'] ?? ''),
            'siglaUF'     => $empresa['endereco']['uf'] ?? 'SP',
            'schemes'     => 'PL_009_V4',
            'versao'      => '4.00',
            'tokenIBPT'   => '',
            'CSC'         => $empresa['csc']   ?? '',
            'CSCid'       => $empresa['idCsc'] ?? '',
        ]);
    }

    private function parseResponse(string $response, string $chave): array
    {
        error_log("[NfceCancelador] Sefaz raw response: " . $response);
        
        // Remove SOAP Envelope para pegar apenas a tag retEnvEvento
        $cleanXml = preg_replace('/^.*<retEnvEvento/is', '<retEnvEvento', $response);
        $cleanXml = preg_replace('/<\/retEnvEvento>.*$/is', '</retEnvEvento>', $cleanXml);

        $xml = simplexml_load_string($cleanXml);

        if ($xml === false) {
            return [
                'status'   => 'erro',
                'mensagem' => 'Resposta inválida da SEFAZ.',
                'chave'    => $chave,
            ];
        }

        // Estrutura retEnvEvento > retEvento > infEvento
        $infEvento = $xml->retEvento->infEvento ?? null;

        if (!$infEvento) {
            $cStat   = (string) ($xml->cStat   ?? '999');
            $xMotivo = (string) ($xml->xMotivo ?? 'Resposta inesperada da SEFAZ');
            return ['status' => 'erro', 'mensagem' => "cStat {$cStat}: {$xMotivo}", 'chave' => $chave];
        }

        $cStat   = (string) $infEvento->cStat;
        $xMotivo = (string) $infEvento->xMotivo;
        $nProt   = (string) ($infEvento->nProt ?? '');
        $dhReg   = (string) ($infEvento->dhRegEvento ?? date('c'));

        // cStat 135 = Evento Registrado e Vinculado a NF-e (cancelamento aceito)
        // cStat 136 = Evento Registrado (NFC-e ainda não autorizada)
        // cStat 573 = Duplicidade de evento (já cancelada)
        if ($cStat === '135' || $cStat === '136' || $cStat === '573') {
            return [
                'status'      => 'cancelada',
                'protocolo'   => $nProt,
                'dataEvento'  => $dhReg,
                'mensagem'    => $xMotivo,
                'chave'       => $chave,
            ];
        }

        return [
            'status'   => 'erro',
            'mensagem' => "cStat {$cStat}: {$xMotivo}",
            'chave'    => $chave,
        ];
    }
}
