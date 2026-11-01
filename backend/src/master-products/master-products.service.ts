import { Injectable } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';

export interface MasterProductLookupResult {
  found: boolean;
  source?: 'cache' | 'cosmos';
  product: {
    ean: string | null;
    name: string;
    brand: string | null;
    ncm: string | null;
    cest: string | null;
    unit: string;
  } | null;
}

// Mapeamento NCM/CEST para categorias retornadas pela Cosmos
const COSMOS_CATEGORY_NCM: Record<string, { ncm: string; cest: string | null }> = {
  'Cerveja':           { ncm: '22030000', cest: '0300100' },
  'Cervejas':          { ncm: '22030000', cest: '0300100' },
  'Chope':             { ncm: '22030000', cest: '0300200' },
  'Vinho':             { ncm: '22042100', cest: '0200900' },
  'Vinhos':            { ncm: '22042100', cest: '0200900' },
  'Espumante':         { ncm: '22041000', cest: '0200900' },
  'Champagne':         { ncm: '22041000', cest: '0200900' },
  'Whisky':            { ncm: '22083000', cest: '0200200' },
  'Whiskey':           { ncm: '22083000', cest: '0200200' },
  'Vodka':             { ncm: '22086000', cest: '0200200' },
  'Gin':               { ncm: '22085000', cest: '0200200' },
  'Rum':               { ncm: '22084000', cest: '0200400' },
  'Cachaça':           { ncm: '22084000', cest: '0200400' },
  'Aguardente':        { ncm: '22084000', cest: '0200400' },
  'Tequila':           { ncm: '22089000', cest: '0200200' },
  'Licor':             { ncm: '22089000', cest: '0200200' },
  'Bebida Alcoólica':  { ncm: '22089000', cest: '0200200' },
  'Energético':        { ncm: '22021000', cest: '0300600' },
  'Refrigerante':      { ncm: '22021000', cest: '0300600' },
  'Água':              { ncm: '22011000', cest: '0300500' },
  'Água Mineral':      { ncm: '22011000', cest: '0300500' },
  'Suco':              { ncm: '20099900', cest: null },
  'Isotônico':         { ncm: '22021000', cest: '0300600' },
  'Chocolate':         { ncm: '18069000', cest: null },
  'Leite':             { ncm: '04012000', cest: null },
  'Café':              { ncm: '09011100', cest: null },
  'Cigarro':           { ncm: '24022000', cest: '0600100' },
  'Cigarros':          { ncm: '24022000', cest: '0600100' },
  'Biscoito':          { ncm: '19059090', cest: null },
  'Snack':             { ncm: '19059090', cest: null },
  'Salgadinho':        { ncm: '20052000', cest: null },
  'Macarrão':          { ncm: '19023000', cest: null },
  'Papel Higiênico':   { ncm: '48181000', cest: null },
  'Detergente':        { ncm: '34022000', cest: null },
};

/**
 * Infere NCM/CEST a partir das categorias retornadas pela Cosmos.
 */
function inferFiscalFromCosmos(categories: string[]): { ncm: string | null; cest: string | null } {
  for (const cat of categories) {
    // Tenta match exato
    if (COSMOS_CATEGORY_NCM[cat]) return COSMOS_CATEGORY_NCM[cat];
    // Tenta match parcial (ex: "Cervejas Lager" → "Cervejas")
    for (const key of Object.keys(COSMOS_CATEGORY_NCM)) {
      if (cat.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cat.toLowerCase())) {
        return COSMOS_CATEGORY_NCM[key];
      }
    }
  }
  return { ncm: null, cest: null };
}

@Injectable()
export class MasterProductsService {
  constructor(private readonly heartPrisma: HeartPrismaService) {}

  /**
   * Lookup principal: cache local → Cosmos API → salva no cache.
   * Nunca lança exceção — falhas são tratadas como graceful degradation.
   *
   * @param ean       EAN-13 a consultar
   * @param tenantId  ID do tenant (para buscar o token Cosmos)
   */
  async lookupByEan(ean: string, tenantId?: string): Promise<MasterProductLookupResult> {
    // Validação básica
    const cleanEan = ean.trim().replace(/\D/g, '');
    if (cleanEan.length !== 13) {
      return { found: false, product: null };
    }

    // ── 1. Tenta o cache local (MasterProduct no Heart DB) ──────────────────
    const cached = await this.heartPrisma.masterProduct.findUnique({
      where: { ean: cleanEan },
      select: { ean: true, name: true, brand: true, ncm: true, cest: true, unit: true },
    });

    if (cached) {
      if (cached.name === 'NOT_FOUND') {
        return { found: false, product: null };
      }
      return { found: true, source: 'cache', product: cached };
    }

    // ── 2. Tenta a API Cosmos se o tenant tem token configurado ──────────────
    if (tenantId) {
      const cosmosResult = await this.queryCosmosAndCache(cleanEan, tenantId);
      if (cosmosResult) return cosmosResult;
    }

    return { found: false, product: null };
  }

  /**
   * Consulta a Cosmos API e, se encontrar, salva no cache permanente.
   * Retorna null se não encontrar ou se ocorrer qualquer erro.
   */
  private async queryCosmosAndCache(
    ean: string,
    tenantId: string,
  ): Promise<MasterProductLookupResult | null> {
    try {
      // Busca o token do tenant no Heart DB
      const tenant = await this.heartPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { cosmosApiKey: true },
      });

      if (!tenant?.cosmosApiKey) return null;

      const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${ean}`, {
        headers: {
          'X-Cosmos-Token': tenant.cosmosApiKey,
          'Content-Type': 'application/json',
          'User-Agent': '7Bar-PDV/1.0',
        },
      });

      if (!res.ok) {
        // Salva NOT_FOUND para evitar novas chamadas inúteis para o mesmo EAN
        await this.heartPrisma.masterProduct.upsert({
          where:  { ean },
          update: {},
          create: { ean, name: "NOT_FOUND", ncm: null, cest: null, unit: "UN", source: "cosmos" }
        });
        return null;
      }

      const data = await res.json();

      // Extrai os campos da resposta Cosmos
      const name    = data.description || data.product_name || null;
      if (!name) {
        await this.heartPrisma.masterProduct.upsert({
          where:  { ean },
          update: {},
          create: { ean, name: "NOT_FOUND", ncm: null, cest: null, unit: "UN", source: "cosmos" }
        });
        return null;
      }
      const brand   = data.brand?.name || null;
      const ncmCode = data.ncm?.code   || null;
      const unit    = 'UN'; // Cosmos raramente retorna unidade — padrão UN

      // Infere CEST pelas categorias da Cosmos
      const categories = (data.gtins_categories || []).map((c: any) => c.category?.description || c.description || '');
      const fiscal = inferFiscalFromCosmos(categories);

      if (!name) return null; // Produto sem nome é inútil

      // Monta o produto
      const productData = {
        ean,
        name:     name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
        brand:    brand || null,
        ncm:      ncmCode || fiscal.ncm,
        cest:     fiscal.cest,
        unit,
        category: categories[0] || null,
        source:   'cosmos',
      };

      // Salva no cache permanente (upsert — idempotente)
      await this.heartPrisma.masterProduct.upsert({
        where:  { ean },
        update: { name: productData.name, brand: productData.brand, ncm: productData.ncm, cest: productData.cest },
        create: productData,
      });

      return {
        found: true,
        source: 'cosmos',
        product: {
          ean,
          name:  productData.name,
          brand: productData.brand,
          ncm:   productData.ncm,
          cest:  productData.cest,
          unit,
        },
      };
    } catch {
      // Falha silenciosa — lookup é auxiliar, não bloqueia o PDV
      return null;
    }
  }

  /**
   * Retorna estatísticas da base mestre.
   * Útil para diagnóstico na tela de configurações.
   */
  async getCount(): Promise<{ total: number; withNcm: number; withCest: number }> {
    const [total, withNcm, withCest] = await Promise.all([
      this.heartPrisma.masterProduct.count(),
      this.heartPrisma.masterProduct.count({ where: { ncm: { not: null } } }),
      this.heartPrisma.masterProduct.count({ where: { cest: { not: null } } }),
    ]);
    return { total, withNcm, withCest };
  }
}
