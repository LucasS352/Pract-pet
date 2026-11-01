import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

// ══════════════════════════════════════════════════════════════════════════════
//  GRUPOS TRIBUTÁRIOS PADRÃO — Simples Nacional (Foco: Disk / Adega / Bar)
//
//  Regras aplicadas:
//  • CSOSN 500 → ST (Substituição Tributária): imposto pago na indústria.
//    O varejista não recolhe ICMS na venda. PIS/COFINS CST 04 (monofásico).
//  • CSOSN 102 → Tributado SN sem crédito de ICMS. PIS/COFINS CST 99 (SN).
//  • CSOSN 400 → Isento de ICMS. Usado para serviços/taxas.
//
//  ⚠️  Estes grupos são pré-configurações de referência para Simples Nacional.
//     Recomenda-se validação com o contador antes de emitir em produção.
// ══════════════════════════════════════════════════════════════════════════════
export const DEFAULT_GRUPOS = [
  {
    nome: '🍺 Cervejas e Alcoólicos (ST)',
    csosn: '500',
    cfop: '5405',
    cstPis: '04',
    aliqPis: 0,
    cstCofins: '04',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['cerveja', 'brahma', 'skol', 'heineken', 'amstel', 'budweiser', 'corona', 'itaipava', 'devassa', 'antarctica', 'chopp', 'stella', 'birra', 'bier'],
  },
  {
    nome: '🥤 Refrigerantes, Sucos e Águas (ST)',
    csosn: '500',
    cfop: '5405',
    cstPis: '04',
    aliqPis: 0,
    cstCofins: '04',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['refrigerante', 'coca', 'pepsi', 'guarana', 'fanta', 'sprite', 'agua', 'suco', 'limonada', 'crystal', 'bonaqua', 'schin', 'coco', 'lipton', 'tang'],
  },
  {
    nome: '🥃 Destilados e Bebidas Quentes (ST)',
    csosn: '500',
    cfop: '5405',
    cstPis: '04',
    aliqPis: 0,
    cstCofins: '04',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['whisky', 'whiskey', 'gin', 'vodka', 'rum', 'cachaca', 'tequila', 'corote', 'vinho', 'espumante', 'conhaque', 'licor', 'pinga', 'aperol', 'baileys', 'tanqueray', 'johnnie', 'absolut', 'bacardi', 'negrita', 'smirnoff', 'jack daniel', 'jameson', 'campari'],
  },
  {
    nome: '⚡ Energéticos e Isotônicos (ST)',
    csosn: '500',
    cfop: '5405',
    cstPis: '04',
    aliqPis: 0,
    cstCofins: '04',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['energetico', 'energy', 'red bull', 'redbull', 'monster', 'tnt', 'vibe', 'burn', 'gatorade', 'powerade', 'isotonico', 'sport'],
  },
  {
    nome: '🚬 Cigarros e Tabacaria (ST)',
    csosn: '500',
    cfop: '5405',
    cstPis: '04',
    aliqPis: 0,
    cstCofins: '04',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['cigarro', 'marlboro', 'lucky', 'derby', 'winston', 'camel', 'palheiro', 'narguile', 'essencia', 'hookah', 'seda', 'tabaco', 'fumo', 'pitillo'],
  },
  {
    nome: '🧊 Gelo e Carvão Vegetal (SN Normal)',
    csosn: '102',
    cfop: '5102',
    cstPis: '99',
    aliqPis: 0,
    cstCofins: '99',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['gelo', 'carvao', 'briquete'],
  },
  {
    nome: '🥨 Salgadinhos e Mercearia (SN Normal)',
    csosn: '102',
    cfop: '5102',
    cstPis: '99',
    aliqPis: 0,
    cstCofins: '99',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['salgado', 'batata', 'doritos', 'cheetos', 'ruffles', 'pringles', 'amendoim', 'chocolate', 'bala', 'biscoito', 'chips', 'pipoca', 'snack', 'wafer', 'torcida', 'fandangos'],
  },
  {
    nome: '🥤 Copos e Descartáveis (SN Normal)',
    csosn: '102',
    cfop: '5102',
    cstPis: '99',
    aliqPis: 0,
    cstCofins: '99',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['copo', 'canudo', 'descartavel', 'guardanapo', 'sacola', 'balde', 'embalagem', 'prato'],
  },
  {
    nome: '🚚 Taxa de Entrega / Frete',
    csosn: '400',
    cfop: '5102',
    cstPis: '07',
    aliqPis: 0,
    cstCofins: '07',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: ['entrega', 'frete', 'delivery', 'taxa', 'servico', 'motoboy'],
  },
  {
    nome: '🚫 Produto SNF',
    csosn: '400',
    cfop: '5102',
    cstPis: '07',
    aliqPis: 0,
    cstCofins: '07',
    aliqCofins: 0,
    aliqIcms: 0,
    ativo: true,
    keywords: [] as string[],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  Função standalone — pode ser importada sem contexto NestJS.
//  Usada pelo TenantsService no provisionamento e no "Atualizar Bancos" (Sys-Init).
// ══════════════════════════════════════════════════════════════════════════════
export async function seedDefaultGruposStatic(
  prismaClient: any,
): Promise<{ criados: number; existentes: number }> {
  let criados = 0;
  let existentes = 0;

  for (const grupo of DEFAULT_GRUPOS) {
    const existing = await prismaClient.grupoTributacao.findFirst({
      where: { nome: grupo.nome },
    });

    if (existing) {
      // Garantir que grupos existentes que batem com o nome padrão sejam marcados como padrão se ainda não forem
      if (!existing.isPadrao) {
        await prismaClient.grupoTributacao.update({
          where: { id: existing.id },
          data: { isPadrao: true },
        });
      }
      existentes++;
    } else {
      await prismaClient.grupoTributacao.create({
        data: {
          nome: grupo.nome,
          csosn: grupo.csosn,
          cfop: grupo.cfop,
          cstPis: grupo.cstPis,
          aliqPis: grupo.aliqPis,
          cstCofins: grupo.cstCofins,
          aliqCofins: grupo.aliqCofins,
          aliqIcms: grupo.aliqIcms,
          ativo: grupo.ativo,
          isPadrao: true,
        },
      });
      criados++;
    }
  }

  return { criados, existentes };
}

// ══════════════════════════════════════════════════════════════════════════════
//  Auto-sugestão de grupo por keywords do nome do produto
// ══════════════════════════════════════════════════════════════════════════════
function suggestGrupoByName(productName: string): string | null {
  const normalized = productName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const grupo of DEFAULT_GRUPOS) {
    if (grupo.keywords.length === 0) continue;
    if (grupo.keywords.some((kw) => normalized.includes(kw))) {
      return grupo.nome;
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
//  TributacaoService — CRUD + seed + suggest (NestJS Injectable)
// ══════════════════════════════════════════════════════════════════════════════
@Injectable()
export class TributacaoService {
  constructor(
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService,
  ) {}

  private async getPrisma(tenantId: string) {
    const { databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async findAll(tenantId: string) {
    const prisma = await this.getPrisma(tenantId);
    return prisma.grupoTributacao.findMany({
      include: {
        categories: { select: { id: true, name: true } },
      },
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const prisma = await this.getPrisma(tenantId);
    const grupo = await prisma.grupoTributacao.findUnique({
      where: { id },
      include: {
        categories: { select: { id: true, name: true } },
      },
    });
    if (!grupo) throw new NotFoundException(`Grupo tributário ${id} não encontrado.`);
    return grupo;
  }

  async create(tenantId: string, data: any) {
    const prisma = await this.getPrisma(tenantId);
    const { categoryIds, ...grupoData } = data;
    const grupo = await prisma.grupoTributacao.create({ data: grupoData });

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      await prisma.category.updateMany({
        where: { id: { in: categoryIds } },
        data: { grupoTributacaoId: grupo.id },
      });
    }

    return this.findOne(tenantId, grupo.id);
  }

  async update(tenantId: string, id: string, data: any) {
    const prisma = await this.getPrisma(tenantId);
    const { categoryIds, ...grupoData } = data;

    const grupo = await prisma.grupoTributacao.update({ where: { id }, data: grupoData });

    if (Array.isArray(categoryIds)) {
      // Desvincular categorias que não estão mais selecionadas
      await prisma.category.updateMany({
        where: { grupoTributacaoId: id, id: { notIn: categoryIds } },
        data: { grupoTributacaoId: null },
      });
      // Vincular categorias selecionadas
      if (categoryIds.length > 0) {
        await prisma.category.updateMany({
          where: { id: { in: categoryIds } },
          data: { grupoTributacaoId: id },
        });
      }
    }

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    const prisma = await this.getPrisma(tenantId);
    
    // Bloquear exclusão de grupo padrão
    const grupo = await prisma.grupoTributacao.findUnique({ where: { id } });
    if (grupo && (grupo as any).isPadrao) {
      throw new BadRequestException('Não é possível remover um grupo tributário padrão do sistema.');
    }

    const count = await prisma.product.count({ where: { grupoTributacaoId: id } });
    if (count > 0) {
      throw new BadRequestException(`Não é possível remover: ${count} produto(s) vinculados a este grupo.`);
    }
    const countCategories = await prisma.category.count({ where: { grupoTributacaoId: id } });
    if (countCategories > 0) {
      throw new BadRequestException(`Não é possível remover: ${countCategories} categoria(s) vinculadas a este grupo.`);
    }
    return prisma.grupoTributacao.delete({ where: { id } });
  }

  /**
   * Sugere um grupo tributário com base no nome do produto.
   * GET /tributacao/suggest?q=brahma
   */
  async suggest(tenantId: string, query: string) {
    if (!query || query.trim().length < 2) return { sugestao: null };

    const groupName = suggestGrupoByName(query);
    if (!groupName) return { sugestao: null };

    const prisma = await this.getPrisma(tenantId);
    // Busca pelo nome sem emoji (busca parcial)
    const nomeSemEmoji = groupName.replace(/[\p{Emoji}]/gu, '').trim();
    const grupo = await prisma.grupoTributacao.findFirst({
      where: { nome: { contains: nomeSemEmoji } },
    });

    return { sugestao: grupo || null, nomesSugerido: groupName };
  }

  /**
   * Popula os grupos padrão no tenant atual via upsert.
   * POST /tributacao/seed-defaults — botão "Restaurar Padrões" no frontend.
   */
  async seedDefaultGrupos(tenantId: string): Promise<{ criados: number; existentes: number }> {
    const prisma = await this.getPrisma(tenantId);
    return seedDefaultGruposStatic(prisma);
  }
}
