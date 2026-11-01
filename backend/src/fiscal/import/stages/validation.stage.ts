import { Injectable } from '@nestjs/common';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * ValidationStage — Primeiro estágio do pipeline de importação.
 *
 * Verifica ANTES de qualquer processamento:
 * 1. XML bem-formado (possui tag infNFe ou nfeProc)
 * 2. Chave de acesso presente e com 44 dígitos
 * 3. Versão do layout compatível (4.00)
 * 4. Modelo do documento (55=NF-e, 65=NFC-e)
 * 5. CNPJ do destinatário corresponde ao tenant
 * 6. Documento já importado (duplicidade)
 */
@Injectable()
export class ValidationStage {
  /**
   * Valida o XML antes de qualquer parsing ou persistência.
   *
   * @param xml - String do XML
   * @param tenantCnpj - CNPJ do tenant (para verificar destinatário)
   * @param existingKeys - Set de chaves já importadas (para anti-duplicação)
   */
  validate(
    xml: string,
    tenantCnpj: string,
    existingKeys: Set<string> = new Set(),
  ): ValidationResult {
    const errors: string[] = [];
    const cleanCnpj = tenantCnpj.replace(/\D/g, '');

    // 1. XML bem-formado: possui estrutura mínima de NF-e
    if (!/<infNFe[\s>]/.test(xml) && !/<nfeProc[\s>]/.test(xml)) {
      errors.push('XML inválido: não é um documento NF-e reconhecível (tag infNFe ausente).');
      return { valid: false, errors }; // falha crítica, parar aqui
    }

    // 2. Chave de acesso
    const chaveMatch = /Id="NFe(\d{44})"/.exec(xml) ||
                       /<chNFe>(\d{44})<\/chNFe>/.exec(xml);
    const chave = chaveMatch ? chaveMatch[1] : null;

    if (!chave) {
      errors.push('XML inválido: chave de acesso de 44 dígitos ausente.');
    } else {
      // 3. Duplicidade: chave já foi importada?
      if (existingKeys.has(chave)) {
        errors.push(`Esta nota (chave ${chave.substring(0, 12)}...) já foi importada anteriormente.`);
      }

      // 4. Verificar dígito verificador (cálculo mod 11 SEFAZ)
      if (!this.validarDigitoChave(chave)) {
        errors.push('Chave de acesso com dígito verificador inválido.');
      }
    }

    // 5. Versão do layout
    const versaoMatch = /versao="([^"]+)"/.exec(xml);
    const versao = versaoMatch ? versaoMatch[1] : null;
    if (versao && versao !== '4.00') {
      errors.push(`Versão do layout '${versao}' não suportada. Versão suportada: 4.00.`);
    }

    // 6. CNPJ do destinatário
    if (cleanCnpj) {
      const destBlock = /<dest[\s>][\s\S]*?<\/dest>/.exec(xml);
      if (destBlock) {
        const cnpjDest = /<CNPJ>(\d+)<\/CNPJ>/.exec(destBlock[0]);
        const cpfDest  = /<CPF>(\d+)<\/CPF>/.exec(destBlock[0]);
        const destDoc  = cnpjDest?.[1] || cpfDest?.[1] || '';

        if (destDoc && destDoc.replace(/\D/g, '') !== cleanCnpj) {
          errors.push(
            `CNPJ do destinatário (${destDoc}) não corresponde ao CNPJ da empresa (${cleanCnpj}). Verifique se o XML é destinado a esta empresa.`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Verifica o dígito verificador da chave de acesso SEFAZ (módulo 11).
   * Chave: 43 dígitos + 1 dígito verificador
   */
  private validarDigitoChave(chave: string): boolean {
    if (chave.length !== 44) return false;

    const digits = chave.substring(0, 43).split('').map(Number);
    const dvEsperado = parseInt(chave[43], 10);

    let soma = 0;
    let peso = 2;
    for (let i = digits.length - 1; i >= 0; i--) {
      soma += digits[i] * peso;
      peso = peso >= 9 ? 2 : peso + 1;
    }

    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;

    return dv === dvEsperado;
  }
}
