<?php
declare(strict_types=1);

namespace App;

use NFePHP\DA\NFe\Danfe;

/**
 * DanfeGenerator — Gera o DANFE (PDF) de uma NF-e usando sped-da.
 *
 * Recebe o XML autorizado da NF-e e retorna o PDF em base64.
 * Requer extensões PHP: gd, mbstring (instaladas via Dockerfile).
 */
class DanfeGenerator
{
    public function gerar(array $payload): array
    {
        $xml     = $payload['xml']     ?? '';
        $logo    = $payload['logo']    ?? ''; // Base64 opcional
        $duplex  = $payload['duplex']  ?? false;

        if (empty($xml)) {
            throw new \InvalidArgumentException('XML da NF-e não fornecido.');
        }

        try {
            $danfe = new Danfe($xml);

            if (!empty($logo)) {
                $logoData = base64_decode($logo);
                if ($logoData !== false) {
                    $tmpFile = tempnam(sys_get_temp_dir(), 'logo_');
                    file_put_contents($tmpFile, $logoData);
                    $danfe->logoParameters($tmpFile, 'C');
                    register_shutdown_function(fn() => @unlink($tmpFile));
                }
            }

            $pdf = $danfe->render();

            return [
                'status'    => 'ok',
                'pdfBase64' => base64_encode($pdf),
                'size'      => strlen($pdf),
            ];
        } catch (\Throwable $e) {
            throw new \RuntimeException('Erro ao gerar DANFE: ' . $e->getMessage(), 0, $e);
        }
    }
}
