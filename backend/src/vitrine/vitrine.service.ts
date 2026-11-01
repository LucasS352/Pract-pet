import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

/** Estrutura de um slide individual */
export interface VitrineSlide {
  slideType?: 'single';
  productId: string;
  productName: string;
  imageUrl: string | null;
  priceSell: number;
  promoPrice: number | null;
  badge: string | null;
  order: number;
}

export interface VitrineGridSlide {
  slideType: 'grid';
  gridId: string;
  order: number;
  gridTitle: string;
  gridSubtitle?: string;
  gridEmoji?: string;
  gridBadge?: string | null;
  duration?: number;
  gridProducts: {
    productId: string;
    productName: string;
    imageUrl: string | null;
    priceSell: number;
    promoPrice: number | null;
  }[];
}

export type AnyVitrineSlide = VitrineSlide | VitrineGridSlide;

/** Payload do rascunho enviado pelo frontend */
export interface DraftDto {
  theme?: string;
  customBgUrl?: string | null;
  showLogo?: boolean;
  logoPosition?: string;
  instagramHandle?: string | null;
  slideDuration?: number;
  gridSlideDuration?: number;
  draftSlides?: AnyVitrineSlide[];
}

/** Payload de publicação */
export interface PublishDto {
  userId: string;
  userName: string;
}

@Injectable()
export class VitrineService {
  private readonly logger = new Logger(VitrineService.name);

  constructor(
    private heartPrisma: HeartPrismaService,
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService,
  ) {}

  /** Retorna o cliente Prisma do tenant atual via contexto */
  private async getTenantPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  /** Garante que a tabela vitrine_config existe no banco do tenant (auto-healing) */
  private async ensureTableExists(prisma: any) {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`vitrine_config\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`active\` TINYINT(1) NOT NULL DEFAULT 0,
          \`version\` INT NOT NULL DEFAULT 0,
          \`publishedAt\` DATETIME(3) NULL,
          \`publishedByUserId\` VARCHAR(191) NULL,
          \`publishedByName\` VARCHAR(191) NULL,
          \`draftUpdatedAt\` DATETIME(3) NULL,
          \`theme\` VARCHAR(191) NOT NULL DEFAULT 'dark_premium',
          \`customBgUrl\` TEXT NULL,
          \`showLogo\` TINYINT(1) NOT NULL DEFAULT 1,
          \`logoPosition\` TEXT NULL,
          \`slideDuration\` INT NOT NULL DEFAULT 8,
          \`draftSlides\` JSON NOT NULL,
          \`publishedSlides\` JSON NOT NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      // Garante migração da coluna existente para TEXT sem perda de dados
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`vitrine_config\` MODIFY COLUMN \`logoPosition\` TEXT NULL;
      `).catch(() => {});
    } catch (err: any) {
      this.logger.warn(`ensureTableExists (vitrine_config): ${err.message}`);
    }
  }

  /** Formata a entidade VitrineConfig desempacotando logoPosition + instagramHandle */
  private formatConfigResponse(config: any) {
    if (!config) return null;
    const { position, instagram } = this.parseLogoPosition(config.logoPosition);
    return {
      ...config,
      logoPosition: position,
      instagramHandle: instagram,
    };
  }

  /** Retorna configuração completa (rascunho + info de publicação) */
  async getConfig() {
    try {
      const prisma = await this.getTenantPrisma();
      await this.ensureTableExists(prisma);

      const config = await prisma.vitrineConfig.findFirst().catch(() => null);

      if (!config) {
        return {
          active: false,
          version: 0,
          publishedAt: null,
          publishedByUserId: null,
          publishedByName: null,
          draftUpdatedAt: null,
          theme: 'dark_premium',
          customBgUrl: null,
          showLogo: true,
          logoPosition: 'top-left',
          instagramHandle: null,
          slideDuration: 8,
          draftSlides: [],
          publishedSlides: [],
        };
      }

      return this.formatConfigResponse(config);
    } catch (err: any) {
      this.logger.error(`Erro ao carregar config da vitrine: ${err.message}`, err.stack);
      throw err;
    }
  }

  /** Auxiliar para decodificar logoPosition + instagramHandle com proteção contra aninhamento recursivo */
  private parseLogoPosition(raw: any): { position: string; instagram: string | null } {
    if (!raw) return { position: 'top-left', instagram: null };
    let pos = 'top-left';
    let insta: string | null = null;

    try {
      let curr = raw;
      // Desempacota recursivamente se for string JSON aninhada
      while (typeof curr === 'string' && curr.trim().startsWith('{')) {
        const parsed = JSON.parse(curr);
        if (parsed && typeof parsed === 'object') {
          if (parsed.instagram !== undefined && parsed.instagram !== null) {
            insta = String(parsed.instagram);
          }
          if (parsed.position !== undefined) {
            curr = parsed.position;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (typeof curr === 'string') {
        if (curr.includes('|')) {
          const [p, i] = curr.split('|');
          pos = p || 'top-left';
          if (i) insta = i;
        } else if (!curr.startsWith('{')) {
          pos = curr;
        }
      }
    } catch {}

    const validPositions = ['top-left', 'top-right', 'bottom', 'bottom-left', 'bottom-right', 'center'];
    if (!validPositions.includes(pos)) {
      pos = 'top-left';
    }

    return { position: pos, instagram: insta };
  }

  /** Salva rascunho sem publicar */
  async saveDraft(data: DraftDto) {
    try {
      const prisma = await this.getTenantPrisma();
      await this.ensureTableExists(prisma);

      const existing = await prisma.vitrineConfig.findFirst().catch(() => null);

      const payload: any = {
        draftUpdatedAt: new Date(),
      };
      if (data.theme !== undefined) payload.theme = String(data.theme);
      if (data.customBgUrl !== undefined) payload.customBgUrl = data.customBgUrl;
      if (data.showLogo !== undefined) payload.showLogo = Boolean(data.showLogo);
      
      if (data.logoPosition !== undefined || data.instagramHandle !== undefined) {
        const current = this.parseLogoPosition(existing?.logoPosition || null);
        const parsedInput = this.parseLogoPosition(data.logoPosition);
        
        const finalPos = data.logoPosition !== undefined ? parsedInput.position : current.position;
        const finalInsta = data.instagramHandle !== undefined 
          ? (data.instagramHandle ? String(data.instagramHandle).trim() : null) 
          : (parsedInput.instagram || current.instagram);

        payload.logoPosition = JSON.stringify({ position: finalPos, instagram: finalInsta });
      }

      if (data.slideDuration !== undefined) payload.slideDuration = Number(data.slideDuration) || 8;
      if (data.draftSlides !== undefined) {
        payload.draftSlides = JSON.parse(JSON.stringify(data.draftSlides));
      }

      let updated;
      if (existing) {
        updated = await prisma.vitrineConfig.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        updated = await prisma.vitrineConfig.create({
          data: {
            theme: payload.theme || 'dark_premium',
            customBgUrl: payload.customBgUrl || null,
            showLogo: payload.showLogo !== undefined ? payload.showLogo : true,
            logoPosition: payload.logoPosition || JSON.stringify({ position: 'top-left', instagram: null }),
            slideDuration: payload.slideDuration || 8,
            draftSlides: payload.draftSlides || [],
            publishedSlides: [],
            ...payload,
          },
        });
      }

      return this.formatConfigResponse(updated);
    } catch (err: any) {
      this.logger.error(`Erro ao salvar rascunho da vitrine: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Publica a vitrine:
   * - Copia draftSlides → publishedSlides (snapshot)
   * - Incrementa version
   * - Registra publishedBy + publishedAt
   */
  async publish(dto: PublishDto) {
    try {
      const prisma = await this.getTenantPrisma();
      await this.ensureTableExists(prisma);

      let existing = await prisma.vitrineConfig.findFirst().catch(() => null);

      if (!existing) {
        existing = await prisma.vitrineConfig.create({
          data: {
            active: true,
            theme: 'dark_premium',
            showLogo: true,
            logoPosition: JSON.stringify({ position: 'top-left', instagram: null }),
            slideDuration: 8,
            draftSlides: [],
            publishedSlides: [],
          },
        });
      }

      const newVersion = (existing.version || 0) + 1;

      const updated = await prisma.vitrineConfig.update({
        where: { id: existing.id },
        data: {
          version: newVersion,
          publishedAt: new Date(),
          publishedByUserId: dto.userId || 'system',
          publishedByName: dto.userName || 'Admin',
          publishedSlides: existing.draftSlides ? JSON.parse(JSON.stringify(existing.draftSlides)) : [],
        },
      });

      return this.formatConfigResponse(updated);
    } catch (err: any) {
      this.logger.error(`Erro ao publicar vitrine: ${err.message}`, err.stack);
      throw err;
    }
  }

  /** Liga ou desliga a vitrine sem republicar */
  async setActive(active: boolean) {
    try {
      const prisma = await this.getTenantPrisma();
      await this.ensureTableExists(prisma);

      const existing = await prisma.vitrineConfig.findFirst().catch(() => null);

      let updated;
      if (existing) {
        updated = await prisma.vitrineConfig.update({
          where: { id: existing.id },
          data: { active: Boolean(active) },
        });
      } else {
        updated = await prisma.vitrineConfig.create({
          data: {
            active: Boolean(active),
            theme: 'dark_premium',
            showLogo: true,
            logoPosition: JSON.stringify({ position: 'top-left', instagram: null }),
            slideDuration: 8,
            draftSlides: [],
            publishedSlides: [],
          },
        });
      }

      return this.formatConfigResponse(updated);
    } catch (err: any) {
      this.logger.error(`Erro ao alternar status da vitrine: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Endpoint PÚBLICO consumido pela TV.
   * Recebe o tvPublicId (do Heart DB), resolve o tenant
   * e retorna os publishedSlides + metadados de exibição.
   * Sem JWT — sem autenticação.
   */
  async getPublicPlaylist(tvPublicId: string) {
    try {
      // 1. Resolver o tenant pelo tvPublicId no Heart DB
      const tenant = await this.heartPrisma.tenant.findUnique({
        where: { tvPublicId },
      }).catch(() => null);

      if (!tenant) {
        throw new NotFoundException('Vitrine não encontrada.');
      }

      // 2. Conectar ao banco do tenant
      const tenantPrisma = await this.tenantManager.getTenantClient(
        tenant.id,
        tenant.databaseUrl,
      );
      await this.ensureTableExists(tenantPrisma);

      // 3. Buscar configuração da vitrine
      const config = await tenantPrisma.vitrineConfig.findFirst().catch(() => null);

      // Se não configurada ou desativada, retorna inactive
      if (!config || !config.active) {
        return { active: false };
      }

      const { position, instagram } = this.parseLogoPosition(config.logoPosition);

      return {
        active: true,
        version: config.version,
        theme: config.theme,
        customBgUrl: config.customBgUrl,
        showLogo: config.showLogo,
        logoPosition: position,
        instagramHandle: instagram,
        logoUrl: tenant.logoUrl ?? null,
        slideDuration: config.slideDuration,
        slides: config.publishedSlides || [],
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Erro ao carregar playlist pública da TV (${tvPublicId}): ${err.message}`, err.stack);
      return { active: false };
    }
  }

  /** Lista os 10 temas pré-definidos disponíveis */
  getThemes() {
    return [
      { slug: 'dark_premium',     name: '✨ Dark Premium',    description: 'Preto fosco com partículas douradas' },
      { slug: 'neon_night',       name: '🌃 Neon Night',      description: 'Escuro com bordas neon coloridas' },
      { slug: 'gradient_sunset',  name: '🌅 Sunset',          description: 'Gradiente laranja/roxo dramático' },
      { slug: 'gradient_ocean',   name: '🌊 Ocean',           description: 'Azul profundo para ciano' },
      { slug: 'light_clean',      name: '💡 Clean Light',     description: 'Branco com sombras suaves' },
      { slug: 'dark_glass',       name: '🪟 Glassmorphism',   description: 'Vidro fosco sobre escuro' },
      { slug: 'forest_green',     name: '🌿 Forest',          description: 'Verde escuro premium' },
      { slug: 'fire_red',         name: '🔥 Fire',            description: 'Vermelho/laranja — energia máxima' },
      { slug: 'purple_luxury',    name: '💜 Luxury',          description: 'Roxo/dourado — sofisticação' },
      { slug: 'carbon_fiber',     name: '⬛ Carbon',          description: 'Textura carbono com detalhes metálicos' },
    ];
  }
}
