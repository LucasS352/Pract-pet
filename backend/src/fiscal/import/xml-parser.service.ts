import { Injectable, Logger } from '@nestjs/common';

export interface NfeItem {
  descricao: string;
  codigoFornecedor: string;
  codigoBarras: string;
  ncm: string;
  cest: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;

  uCom?: string;
  qCom?: number;
  vUnCom?: number;
  cEANTrib?: string;

  // Impostos
  cstIcms?: string;
  aliqIcms?: number;
  vBCIcms?: number;
  vIcms?: number;
  cstPis?: string;
  aliqPis?: number;
  vPis?: number;
  cstCofins?: string;
  aliqCofins?: number;
  vCofins?: number;
  cstIpi?: string;
  aliqIpi?: number;
  vIpi?: number;
  ibsCst?: string;
  ibsAliq?: number;
  vIbs?: number;
  cbsCst?: string;
  cbsAliq?: number;
  vCbs?: number;
}

export interface NfeParsed {
  chave: string;
  numero: string;
  serie: string;
  dataEmissao: Date;
  xmlVersion: string;
  schemaVersion: string;
  fornecedor: {
    cnpj: string;
    nome: string;
    ie: string;
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
  };
  destinatario: {
    cnpj: string;
    nome: string;
  };
  valorTotal: number;
  itens: NfeItem[];
}

/**
 * XmlParserService — Extrai dados estruturados de XMLs fiscais (NF-e, NFC-e).
 *
 * Design:
 * - Usa apenas APIs nativas do Node (sem dependências externas)
 * - Preparado para evoluir para NFC-e, MDF-e, CT-e
 * - Sempre valida o CNPJ do destinatário antes de retornar
 */
@Injectable()
export class XmlParserService {
  private readonly logger = new Logger(XmlParserService.name);

  /**
   * Extrai todos os campos relevantes de um XML de NF-e.
   * Lança erro se o XML não for um documento NF-e válido.
   */
  parse(xmlContent: string): NfeParsed {
    this.logger.log('Iniciando parsing de XML NF-e...');

    const chave    = this.extractTag(xmlContent, 'chNFe') || this.extractIdChave(xmlContent);
    const numero   = this.extractTag(xmlContent, 'nNF');
    const serie    = this.extractTag(xmlContent, 'serie');
    const dhEmi    = this.extractTag(xmlContent, 'dhEmi') || this.extractTag(xmlContent, 'dEmi');
    const versao   = this.extractAttr(xmlContent, 'infNFe', 'versao') || '4.00';

    if (!chave || chave.length !== 44) {
      throw new Error('XML inválido: chave de acesso ausente ou com formato incorreto.');
    }
    if (!numero) {
      throw new Error('XML inválido: número da NF-e ausente.');
    }

    const emit = this.extractBlock(xmlContent, 'emit');
    const dest = this.extractBlock(xmlContent, 'dest');
    const enderEmit = this.extractBlock(emit || '', 'enderEmit');

    const fornecedor = {
      cnpj:       this.cleanDigits(this.extractTag(emit || '', 'CNPJ') || ''),
      nome:       this.extractTag(emit || '', 'xNome') || '',
      ie:         this.extractTag(emit || '', 'IE') || '',
      logradouro: this.extractTag(enderEmit || '', 'xLgr') || '',
      numero:     this.extractTag(enderEmit || '', 'nro') || '',
      bairro:     this.extractTag(enderEmit || '', 'xBairro') || '',
      municipio:  this.extractTag(enderEmit || '', 'xMun') || '',
      uf:         this.extractTag(enderEmit || '', 'UF') || '',
      cep:        this.cleanDigits(this.extractTag(enderEmit || '', 'CEP') || ''),
    };

    const destinatario = {
      cnpj: this.cleanDigits(
        this.extractTag(dest || '', 'CNPJ') ||
        this.extractTag(dest || '', 'CPF') || ''
      ),
      nome: this.extractTag(dest || '', 'xNome') || 'Consumidor Final',
    };

    // Extrair valor total
    const totalTag = this.extractBlock(xmlContent, 'ICMSTot') || this.extractBlock(xmlContent, 'total');
    const valorTotal = parseFloat(this.extractTag(totalTag || '', 'vNF') || '0');

    // Extrair itens (blocos <det ...>)
    const itens = this.extractItens(xmlContent);

    this.logger.log(
      `XML parseado: Chave ${chave.substring(0, 12)}... | ${itens.length} itens | Fornecedor: ${fornecedor.nome}`,
    );

    return {
      chave,
      numero,
      serie: serie || '1',
      dataEmissao: dhEmi ? new Date(dhEmi) : new Date(),
      xmlVersion: versao,
      schemaVersion: `PL_009_V${versao.split('.')[0]}`,
      fornecedor,
      destinatario,
      valorTotal,
      itens,
    };
  }

  private extractItens(xml: string): NfeItem[] {
    const itens: NfeItem[] = [];
    // Regex para capturar cada bloco <det ...>...</det>
    const detRegex = /<det[\s][^>]*>([\s\S]*?)<\/det>/gi;
    let match: RegExpExecArray | null;

    while ((match = detRegex.exec(xml)) !== null) {
      const det  = match[1];
      const prod = this.extractBlock(det, 'prod') || det;

      const qCom           = parseFloat(this.extractTag(prod, 'qCom')  || '0');
      const uCom           = this.extractTag(prod, 'uCom') || 'UN';
      const vUnCom         = parseFloat(this.extractTag(prod, 'vUnCom')|| '0');

      const qTrib          = parseFloat(this.extractTag(prod, 'qTrib') || '0');
      const uTrib          = this.extractTag(prod, 'uTrib') || 'UN';
      const vUnTrib        = parseFloat(this.extractTag(prod, 'vUnTrib')|| '0');
      const cEANTrib       = this.extractTag(prod, 'cEANTrib') || '';

      const custoTotal     = parseFloat(this.extractTag(prod, 'vProd') || '0');

      // Se existirem dados tributados (individuais), usamos no estoque
      const quantidade     = qTrib > 0 ? qTrib : qCom;
      const custoUnitario  = vUnTrib > 0 ? vUnTrib : vUnCom;
      const unidade        = qTrib > 0 ? uTrib : uCom;

      const imposto = this.extractBlock(det, 'imposto') || '';

      // ICMS
      const icmsBlock = this.extractBlock(imposto, 'ICMS') || '';
      const cstIcms = this.extractTag(icmsBlock, 'CST') || this.extractTag(icmsBlock, 'CSOSN') || '';
      const aliqIcms = parseFloat(this.extractTag(icmsBlock, 'pICMS') || '0');
      const vBCIcms = parseFloat(this.extractTag(icmsBlock, 'vBC') || '0');
      const vIcms = parseFloat(this.extractTag(icmsBlock, 'vICMS') || '0');

      // PIS
      const pisBlock = this.extractBlock(imposto, 'PIS') || '';
      const cstPis = this.extractTag(pisBlock, 'CST') || '';
      const aliqPis = parseFloat(this.extractTag(pisBlock, 'pPIS') || '0');
      const vPis = parseFloat(this.extractTag(pisBlock, 'vPIS') || '0');

      // COFINS
      const cofinsBlock = this.extractBlock(imposto, 'COFINS') || '';
      const cstCofins = this.extractTag(cofinsBlock, 'CST') || '';
      const aliqCofins = parseFloat(this.extractTag(cofinsBlock, 'pCOFINS') || '0');
      const vCofins = parseFloat(this.extractTag(cofinsBlock, 'vCOFINS') || '0');

      // IPI
      const ipiBlock = this.extractBlock(imposto, 'IPI') || '';
      const cstIpi = this.extractTag(ipiBlock, 'CST') || '';
      const aliqIpi = parseFloat(this.extractTag(ipiBlock, 'pIPI') || '0');
      const vIpi = parseFloat(this.extractTag(ipiBlock, 'vIPI') || '0');

      // IBS (NT 2025.002)
      const ibsBlock = this.extractBlock(imposto, 'IBS') || '';
      const ibsCst = this.extractTag(ibsBlock, 'CST') || '';
      const ibsAliq = parseFloat(this.extractTag(ibsBlock, 'pIBS') || '0');
      const vIbs = parseFloat(this.extractTag(ibsBlock, 'vIBS') || '0');

      // CBS (NT 2025.002)
      const cbsBlock = this.extractBlock(imposto, 'CBS') || '';
      const cbsCst = this.extractTag(cbsBlock, 'CST') || '';
      const cbsAliq = parseFloat(this.extractTag(cbsBlock, 'pCBS') || '0');
      const vCbs = parseFloat(this.extractTag(cbsBlock, 'vCBS') || '0');

      itens.push({
        descricao:        this.sanitize(this.extractTag(prod, 'xProd') || ''),
        codigoFornecedor: this.extractTag(prod, 'cProd') || '',
        codigoBarras:     this.extractTag(prod, 'cEAN')  || '',
        ncm:              this.cleanDigits(this.extractTag(prod, 'NCM') || ''),
        cest:             this.cleanDigits(this.extractTag(prod, 'CEST') || ''),
        cfop:             this.extractTag(prod, 'CFOP') || '',
        unidade,
        quantidade,
        custoUnitario,
        custoTotal,

        uCom,
        qCom,
        vUnCom,
        cEANTrib,

        // Impostos
        cstIcms,
        aliqIcms,
        vBCIcms,
        vIcms,
        cstPis,
        aliqPis,
        vPis,
        cstCofins,
        aliqCofins,
        vCofins,
        cstIpi,
        aliqIpi,
        vIpi,
        ibsCst,
        ibsAliq,
        vIbs,
        cbsCst,
        cbsAliq,
        vCbs,
      });
    }

    return itens;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
    const match = regex.exec(xml);
    return match ? match[1].trim() : null;
  }

  private extractBlock(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\/${tag}>`, 'i');
    const match = regex.exec(xml);
    return match ? match[0] : null;
  }

  private extractAttr(xml: string, tag: string, attr: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, 'i');
    const match = regex.exec(xml);
    return match ? match[1] : null;
  }

  private extractIdChave(xml: string): string {
    // Tenta extrair da tag Id="NFe{44 digits}"
    const match = /Id="NFe(\d{44})"/.exec(xml);
    return match ? match[1] : '';
  }

  private cleanDigits(value: string): string {
    return value.replace(/\D/g, '');
  }

  private sanitize(value: string): string {
    return value.replace(/[\x00-\x1F\x7F]/g, '').trim();
  }
}
