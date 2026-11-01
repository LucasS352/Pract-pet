<?php
declare(strict_types=1);

namespace App;

use NFePHP\NFe\Tools;
use NFePHP\Common\Certificate;
use NFePHP\Common\Soap\SoapCurl;

/**
 * NfceConsultor — Consulta o status de uma NFC-e diretamente na SEFAZ.
 */
class NfceConsultor
{
    public function consultarStatus(array $payload): array
    {
        $empresa = $payload['empresa'];
        $certB64 = $payload['certPfxBase64'] ?? '';
        $senha   = $payload['certSenha']     ?? '';
        $chave   = $payload['chave']         ?? '';
        $amb     = (int) ($empresa['ambiente'] ?? 2);

        if (empty($chave) || strlen($chave) !== 44) {
            throw new \InvalidArgumentException('Chave de acesso inválida (deve ter 44 dígitos).');
        }

        $certPfx = base64_decode($certB64);
        if (empty($certPfx)) {
            throw new \RuntimeException('Certificado PFX inválido ou não fornecido.');
        }
        $certData = [];
        if (!openssl_pkcs12_read($certPfx, $certData, $senha)) {
            $err = openssl_error_string() ?: 'Senha incorreta ou arquivo corrompido';
            throw new \RuntimeException("Falha ao ler certificado PFX: {$err}");
        }

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

        $maxAttempts = 3;
        $response    = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = $tools->sefazConsultaChave($chave);
                break;
            } catch (\Exception $e) {
                $msg = $e->getMessage();
                $isNetworkError = stripos($msg, 'SSL_ERROR_SYSCALL') !== false
                    || stripos($msg, 'timeout') !== false
                    || stripos($msg, 'connection') !== false;

                if ($isNetworkError && $attempt < $maxAttempts) {
                    $sleepMs = 500 * (2 ** ($attempt - 1));
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
        $xml = simplexml_load_string($response);

        if ($xml === false) {
            return ['status' => 'erro', 'mensagem' => 'Resposta inválida da SEFAZ.', 'chave' => $chave];
        }

        // retConsSitNFe > protNFe > infProt
        $infProt = $xml->protNFe->infProt ?? null;

        if (!$infProt) {
            // Talvez seja uma NFC-e cancelada — checar procEventoNFe
            $infEvento = $xml->procEventoNFe->retEvento->infEvento ?? null;
            if ($infEvento && (string) $infEvento->tpEvento === '110111') {
                return [
                    'status'    => 'cancelada',
                    'chave'     => $chave,
                    'mensagem'  => (string) ($infEvento->xMotivo ?? 'Cancelada'),
                    'protocolo' => (string) ($infEvento->nProt   ?? ''),
                    'dhRecbto'  => (string) ($infEvento->dhRegEvento ?? ''),
                ];
            }

            $cStat   = (string) ($xml->cStat   ?? '999');
            $xMotivo = (string) ($xml->xMotivo ?? 'Resposta inesperada');
            return ['status' => 'desconhecido', 'mensagem' => "cStat {$cStat}: {$xMotivo}", 'chave' => $chave];
        }

        $cStat    = (string) $infProt->cStat;
        $xMotivo  = (string) $infProt->xMotivo;
        $nProt    = (string) ($infProt->nProt   ?? '');
        $dhRecbto = (string) ($infProt->dhRecbto ?? '');

        $statusMap = [
            '100' => 'autorizada',
            '101' => 'cancelada',
            '110' => 'denegada',
            '301' => 'denegada',
            '302' => 'denegada',
        ];

        $statusNfe = $statusMap[$cStat] ?? 'rejeitada';

        return [
            'status'    => $statusNfe,
            'cStat'     => $cStat,
            'mensagem'  => $xMotivo,
            'protocolo' => $nProt,
            'dhRecbto'  => $dhRecbto,
            'chave'     => $chave,
        ];
    }
}
