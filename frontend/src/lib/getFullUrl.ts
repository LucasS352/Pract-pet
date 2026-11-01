/**
 * Converte qualquer URL de imagem/upload para um caminho relativo.
 * 
 * Suporta três formatos salvos no banco:
 *   1. URL absoluta legada: "http://localhost:3520/api/tenants/uploads/..." → "/api/tenants/uploads/..."
 *   2. Caminho relativo com /: "/api/tenants/uploads/..." → retorna como está
 *   3. Caminho sem /: "uploads/..." → "/uploads/..."
 * 
 * Usando caminho relativo, o browser sempre buscará na mesma origem,
 * funcionando corretamente tanto via IP (HTTP) quanto via domínio (HTTPS).
 */
export function getFullUrl(url: string | null | undefined): string {
  if (!url) return '';

  // URL absoluta (ex: http://localhost:3520/api/..., http://179.127.59.225:3520/api/...)
  // Extrai apenas o pathname para tornar a URL relativa
  if (url.startsWith('http')) {
    try {
      const { pathname } = new URL(url);
      return pathname;
    } catch {
      return url;
    }
  }

  // Caminho relativo — retorna garantindo que começa com /
  return url.startsWith('/') ? url : '/' + url;
}
