import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { upgradeTenantSchema } from './tenant-schema-upgrade';

const execAsync = promisify(exec);

/** Gera um ID público único de 8 caracteres para a Vitrine Digital (ex: "4J9XQ2KM") */
function generateTvPublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem ambiguidades (0/O, 1/I)
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

import { ProvisionTenantDto } from './provision-tenant.dto';
import { seedDefaultGruposStatic } from '../tributacao/tributacao.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private heartPrisma: HeartPrismaService,
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService
  ) {}

  findAll() {
    return this.heartPrisma.tenant.findMany({ include: { users: true, tenantIntegrations: true } });
  }

  create(data: any) {
    return this.heartPrisma.tenant.create({ data: {
      ...data,
      ...(data.modulos !== undefined ? { modulos: data.modulos } : {}),
    } });
  }

  async findById(tenantId: string) {
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant && tenantId === 'demo-tenant-001') {
      return {
        id: 'demo-tenant-001',
        name: 'Adega Modelo',
        nomeFantasia: 'Adega Modelo',
        razaoSocial: 'Adega Modelo Demonstração LTDA',
        cnpj: '00.000.000/0001-99',
        databaseName: 'demo_adega',
        status: 'active',
        modulos: { nfce: true, estoque: true, dashboardMobile: true, comandas: true },
        nfceAtivo: false,
        proximaNota: 1,
      };
    }

    if (!tenant) throw new NotFoundException('Empresa não encontrada');

    // Se por algum motivo um tenant antigo não tiver tvPublicId, gera um automaticamente
    if (!tenant.tvPublicId && tenantId !== 'demo-tenant-001') {
      const newTvId = generateTvPublicId();
      await this.heartPrisma.tenant.update({
        where: { id: tenantId },
        data: { tvPublicId: newTvId },
      }).catch(err => this.logger.warn(`Não foi possível gerar tvPublicId para ${tenantId}: ${err.message}`));
      (tenant as any).tvPublicId = newTvId;
    }

    // Remover o certificado (blob) por segurança
    const { certPfx, ...safeTenant } = tenant as any;

    try {
      const tenantPrisma = await this.tenantManager.getTenantClient(tenantId, tenant.databaseUrl);
      const numeracao = await tenantPrisma.numeracaoNfce.findUnique({
        where: { serie: tenant.nfceSerie || 1 }
      });
      safeTenant.proximaNota = (numeracao?.ultimo ?? 0) + 1;
    } catch (e: any) {
      this.logger.warn(`Não foi possível carregar a numeração da NFC-e para o tenant ${tenantId}: ${e.message}`);
      safeTenant.proximaNota = 1;
    }

    return safeTenant;
  }

  async updateTenant(tenantId: string, data: any) {
    // Campos permitidos (whitelist — nunca atualizar certPfx por aqui)
    const allowed = [
      'razaoSocial', 'nomeFantasia', 'cnpj', 'ie', 'im', 'crt',
      'logradouro', 'numero', 'complemento', 'bairro',
      'municipio', 'codMunicipio', 'uf', 'cep', 'telefone',
      'nfceAtivo', 'nfceSerie', 'nfceAmbiente', 'nfceCsc', 'nfceIdCsc',
      'modulos', 'status', 'emailContador', 'mensalidadeValor', 'mensalidadeVencimento',
      'tvPublicId',
      // Novos campos de contato e notas
      'telefoneContato', 'emailContato', 'observacoes',
    ];
    // Tipamos explicitamente como Record<string, any> para evitar erro TS no acesso de chaves dinâmicas
    const safeData: Record<string, any> = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k))
    );

    // Tratar tipos numéricos para evitar que strings quebrem o Prisma
    if (safeData.crt != null)          safeData.crt          = Number(safeData.crt);
    if (safeData.nfceSerie != null)    safeData.nfceSerie    = Number(safeData.nfceSerie);
    if (safeData.nfceAmbiente != null) safeData.nfceAmbiente = Number(safeData.nfceAmbiente);
    if (safeData.mensalidadeValor != null) {
      safeData.mensalidadeValor = Number(safeData.mensalidadeValor);
    }
    if (safeData.mensalidadeVencimento !== undefined) {
      safeData.mensalidadeVencimento = safeData.mensalidadeVencimento ? new Date(safeData.mensalidadeVencimento) : null;
    }

    // Normalizar CNPJ: remove pontuação e verifica duplicidade em outros tenants
    if (safeData.cnpj) {
      const cleanCnpj = String(safeData.cnpj).replace(/\D/g, '');
      const duplicate = await this.heartPrisma.tenant.findFirst({
        where: { cnpj: cleanCnpj, id: { not: tenantId } }
      });

      if (duplicate) {
        // Em ambiente de desenvolvimento pode haver CNPJs duplicados de testes — ignoramos silenciosamente
        this.logger.warn(
          `[Ambiente de Testes] CNPJ ${data.cnpj} já pertence à empresa "${duplicate.razaoSocial || duplicate.name}". ` +
          'CNPJ não atualizado. Demais campos serão salvos normalmente.'
        );
        delete safeData.cnpj;
      } else {
        safeData.cnpj = cleanCnpj;
      }
    }

    // Atualizar proximaNota no banco específico do tenant se fornecido
    if (data.proximaNota !== undefined) {
      const proxima = Number(data.proximaNota);
      if (!isNaN(proxima) && proxima > 0) {
        try {
          const tenant = await this.heartPrisma.tenant.findUnique({
            where: { id: tenantId },
          });
          if (tenant) {
            const serie = safeData.nfceSerie !== undefined ? Number(safeData.nfceSerie) : (tenant.nfceSerie || 1);
            const tenantPrisma = await this.tenantManager.getTenantClient(tenantId, tenant.databaseUrl);
            await tenantPrisma.numeracaoNfce.upsert({
              where: { serie },
              update: { ultimo: proxima - 1 },
              create: { serie, ultimo: proxima - 1 }
            });
          }
        } catch (dbErr: any) {
          this.logger.error(`Erro ao atualizar proximaNota para tenant ${tenantId}: ${dbErr.message}`);
        }
      }
    }

    try {
      if (data.modulos !== undefined) {
        // Serialize concurrent module edits so unrelated flags are never lost.
        return await this.heartPrisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
          const current = await tx.tenant.findUnique({ where: { id: tenantId }, select: { modulos: true } });
          if (!current) throw new NotFoundException('Empresa não encontrada.');
          return tx.tenant.update({ where: { id: tenantId }, data: {
            ...safeData,
            modulos: { ...(typeof current.modulos === "object" && current.modulos ? current.modulos : {}), ...data.modulos } as any,
          } });
        });
      }
      return await this.heartPrisma.tenant.update({
        where: { id: tenantId },
        data: safeData,
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException || err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      this.logger.error(`Erro ao atualizar tenant ${tenantId}: ${err.message}`, err.stack);
      throw new BadRequestException(`Erro ao salvar dados no banco: ${err.message}`);
    }
  }

  async getLogoImage(id: string) {
    return this.heartPrisma.image.findUnique({ where: { id } });
  }

  async uploadLogo(tenantId: string, file: Express.Multer.File) {
    const image = await this.heartPrisma.image.create({
      data: {
        data: Buffer.from(file.buffer),
        mimeType: file.mimetype,
      }
    });
    
    const logoUrl = `/api/tenants/uploads/logos/${image.id}`;
    
    return this.heartPrisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl },
    }).then(() => ({ message: 'Logo atualizado com sucesso.', logoUrl }));
  }

  async uploadCertificado(tenantId: string, pfxBuffer: Buffer, senha: string) {
    // Extrair validade do certificado via parsing básico (DER)
    // Por ora, armazenamos sem validar — o PHP valida ao emitir
    return this.heartPrisma.tenant.update({
      where: { id: tenantId },
      data: {
        certPfx: Buffer.from(pfxBuffer),
        certSenha: senha,
        certValidade: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Validade provisória para o painel reconhecer
      },
    }).then(() => ({ message: 'Certificado armazenado com sucesso.' }));
  }

  async validatePin(pin: string): Promise<boolean> {
    const setupPin = process.env.SETUP_PIN || 'teltech352';
    const sqlPin = process.env.SQL_PIN || '43619835';
    if (!pin) return false;
    return pin === setupPin || pin === sqlPin;
  }

  async migrateTenants(tenantIds: string[], includeHeart = false): Promise<any[]> {
    const results: any[] = [];

    // ── 1. Migrar o banco Heart (master) se solicitado ────────────────────
    if (includeHeart) {
      const heartSchemaPath = path.resolve(process.cwd(), 'prisma', 'heart.schema.prisma');
      const heartDbUrl = process.env.DATABASE_URL_HEART;

      this.logger.log('[Migracao] Iniciando atualização do banco Heart (master)...');

      if (!heartDbUrl) {
        results.push({
          tenantId: '__heart__',
          name: '🫀 Banco Heart (master)',
          databaseName: 'heart',
          status: 'error',
          output: 'Variável de ambiente DATABASE_URL_HEART não encontrada no servidor.',
        });
      } else {
        try {
          const { stdout, stderr } = await execAsync(
            `npx prisma db push --schema="${heartSchemaPath}" --skip-generate`,
            {
              env: { ...process.env, DATABASE_URL_HEART: heartDbUrl },
              timeout: 120000,
            }
          );

          results.push({
            tenantId: '__heart__',
            name: '🫀 Banco Heart (master)',
            databaseName: 'heart',
            status: 'success',
            output: stdout || 'Schema Heart atualizado com sucesso.',
          });
          this.logger.log('[Migracao] Banco Heart atualizado com sucesso.');
        } catch (err: any) {
          this.logger.error(`[Migracao] Erro ao atualizar banco Heart: ${err.message}`);
          results.push({
            tenantId: '__heart__',
            name: '🫀 Banco Heart (master)',
            databaseName: 'heart',
            status: 'error',
            output: `Erro na migração Heart:\n${err.stderr || err.message}\n${err.stdout || ''}`,
          });
        }
      }
    }

    // ── 2. Migrar bancos dos tenants selecionados ─────────────────────────
    const tenants = await this.heartPrisma.tenant.findMany({
      where: { id: { in: tenantIds } }
    });

    for (const tenant of tenants) {
      this.logger.log(`[Migracao] Iniciando atualizacao de schema do tenant: ${tenant.name} (${tenant.databaseName})`);
      
      // Nota: removida limpeza de operatorId que fechava os caixas abertos.
      // Atualização de bancos existentes recusa mudanças com risco de perda de dados.

      // 2. Executar db push
      try {
        const prismaSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
        const { stdout, stderr } = await upgradeTenantSchema(tenant.databaseUrl, () => execAsync(`npx prisma db push --schema="${prismaSchemaPath}" --skip-generate`, {
          env: {
            ...process.env,
            DATABASE_URL_TENANT: tenant.databaseUrl,
          },
          timeout: 60000,
        }));

        // Após atualizar o schema, popular grupos tributários padrão (upsert — seguro)
        let seedResult = { criados: 0, existentes: 0 };
        try {
          const tenantClient = new PrismaClient({
            datasources: { db: { url: tenant.databaseUrl } },
          });
          await tenantClient.$connect();
          seedResult = await seedDefaultGruposStatic(tenantClient);

          // Backfill de códigos sequenciais amigáveis para vendas antigas
          const unnumberedSales = await (tenantClient.sale as any).findMany({
            where: { code: null },
            orderBy: { createdAt: 'asc' },
            select: { id: true }
          });
          if (unnumberedSales.length > 0) {
            const maxSale = await (tenantClient.sale as any).findFirst({
              where: { code: { not: null } },
              orderBy: { code: 'desc' },
              select: { code: true }
            });
            let currentSaleCode = maxSale?.code || 0;
            for (const s of unnumberedSales) {
              currentSaleCode++;
              await (tenantClient.sale as any).update({
                where: { id: s.id },
                data: { code: currentSaleCode }
              });
            }
            this.logger.log(`[Migracao] Backfill de códigos de vendas: ${unnumberedSales.length} vendas numeradas.`);
          }

          // Backfill de códigos sequenciais amigáveis para caixas antigos
          const unnumberedRegisters = await (tenantClient.cashRegister as any).findMany({
            where: { code: null },
            orderBy: { openingTime: 'asc' },
            select: { id: true }
          });
          if (unnumberedRegisters.length > 0) {
            const maxRegister = await (tenantClient.cashRegister as any).findFirst({
              where: { code: { not: null } },
              orderBy: { code: 'desc' },
              select: { code: true }
            });
            let currentRegCode = maxRegister?.code || 0;
            for (const r of unnumberedRegisters) {
              currentRegCode++;
              await (tenantClient.cashRegister as any).update({
                where: { id: r.id },
                data: { code: currentRegCode }
              });
            }
            this.logger.log(`[Migracao] Backfill de códigos de caixas: ${unnumberedRegisters.length} caixas numerados.`);
          }

          await tenantClient.$disconnect();
        } catch (seedErr: any) {
          this.logger.warn(`Pós-migração (seed/backfill) falhou para ${tenant.name}: ${seedErr.message}`);
        }

        results.push({
          tenantId: tenant.id,
          name: tenant.name,
          databaseName: tenant.databaseName,
          status: 'success',
          output: stdout || 'Schema atualizado com sucesso.',
          gruposSeed: seedResult,
        });
      } catch (err: any) {
        this.logger.error(`Erro ao rodar migracao em ${tenant.name}: ${err.message}`);
        results.push({
          tenantId: tenant.id,
          name: tenant.name,
          databaseName: tenant.databaseName,
          status: 'error',
          output: `Erro na migracao:\n${err.stderr || err.message}\n${err.stdout || ''}`
        });
      }
    }

    return results;
  }

  async getTenantCategories(tenantId: string) {
    const tenant = await this.heartPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.databaseUrl) return [];
    
    try {
      const tenantPrisma = await this.tenantManager.getTenantClient(tenantId, tenant.databaseUrl);
      return await tenantPrisma.category.findMany({ orderBy: { name: 'asc' } });
    } catch (e: any) {
      this.logger.error(`Erro ao buscar categorias do tenant ${tenantId}: ${e.message}`);
      return [];
    }
  }

  async provisionTenant(dto: ProvisionTenantDto) {
    const { pin, tenantName, dbName, adminName, adminEmail, adminPassword, seedProducts, mensalidadeValor, mensalidadeVencimento } = dto;

    // 1. Validar PIN
    const pinValid = await this.validatePin(pin);
    if (!pinValid) {
      throw new UnauthorizedException('PIN inválido. Acesso negado.');
    }

    // 2. Sanitizar nome do banco (apenas letras, números e _)
    const sanitizedDbName = dbName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');

    if (!sanitizedDbName) {
      throw new BadRequestException('Nome do banco inválido após sanitização.');
    }

    // 3. Verificar se tenant já existe
    const existingTenant = await this.heartPrisma.tenant.findFirst({
      where: { databaseName: sanitizedDbName },
    });
    if (existingTenant) {
      throw new BadRequestException(`Já existe um tenant com o banco "${sanitizedDbName}".`);
    }

    // 4. Verificar se email já existe
    const existingUser = await this.heartPrisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (existingUser) {
      throw new BadRequestException(`Já existe um usuário com o email "${adminEmail}".`);
    }

    // 5. Criar o banco de dados via SQL raw
    await this.heartPrisma.$queryRawUnsafe(
      `CREATE DATABASE IF NOT EXISTS \`${sanitizedDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    // 6. Montar a DATABASE_URL para o novo tenant
    const baseUrl = process.env.DATABASE_URL_HEART || '';
    // Substituir apenas o nome do banco no final da URL
    const tenantDbUrl = baseUrl.replace(/\/[^/]+$/, `/${sanitizedDbName}`);

    // 7. Rodar migrations Prisma no novo banco
    try {
      const prismaSchemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
      await execAsync(`npx prisma db push --schema="${prismaSchemaPath}" --skip-generate --accept-data-loss`, {
        env: {
          ...process.env,
          DATABASE_URL_TENANT: tenantDbUrl,
        },
        timeout: 60000,
      });
    } catch (err: any) {
      // Tentar limpar banco criado se migrate falhar
      await this.heartPrisma.$queryRawUnsafe(`DROP DATABASE IF EXISTS \`${sanitizedDbName}\``);
      this.logger.error(`Erro no provisionamento (db push) do tenant ${tenantName}: ${err.stdout} ${err.stderr}`);
      throw new BadRequestException('Erro ao criar tabelas no novo banco. Detalhe: ' + (err.stderr || err.message));
    }

    // 8. Criar tenant + admin no banco heart (dentro de uma transaction)
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const tenant = await this.heartPrisma.tenant.create({
      data: {
        name: tenantName,
        databaseName: sanitizedDbName,
        databaseUrl: tenantDbUrl,
        status: 'active',
        modulos: { petshop: true, nfce: true, estoque: true, dashboardMobile: true, comandas: true },
        tvPublicId: generateTvPublicId(),
        mensalidadeValor: mensalidadeValor != null ? Number(mensalidadeValor) : 0,
        mensalidadeVencimento: mensalidadeVencimento ? new Date(mensalidadeVencimento) : null,
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            role: 'admin',
          },
        },
      },
      include: { users: true },
    });

    // 9. Popular produtos base no novo banco do tenant (se solicitado)
    if (seedProducts !== false) {
      try {
        await this.seedTenantProducts(tenantDbUrl);
      } catch (err) {
        // Seed falhou mas não desfaz — o sistema funciona sem produtos, admins podem cadastrar manualmente
        this.logger.warn(`Aviso: seed de produtos para ${tenantName} falhou: ${err.message}`);
      }
    }

    // 10. Popular grupos tributários padrão no novo banco
    try {
      const tenantClient = new PrismaClient({
        datasources: { db: { url: tenantDbUrl } },
      });
      await tenantClient.$connect();
      const gruposResult = await seedDefaultGruposStatic(tenantClient);
      await tenantClient.$disconnect();
      this.logger.log(`Grupos tributários padrão criados para ${tenantName}: ${gruposResult.criados} criados.`);
    } catch (err: any) {
      this.logger.warn(`Aviso: seed de grupos tributários para ${tenantName} falhou: ${err.message}`);
    }

    return {
      message: `Tenant "${tenantName}" provisionado com sucesso!`,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        databaseName: tenant.databaseName,
        admin: {
          name: tenant.users[0]?.name,
          email: tenant.users[0]?.email,
          role: tenant.users[0]?.role,
        },
      },
    };
  }

  private async seedTenantProducts(databaseUrl: string) {
    const client = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    try {
      await client.$connect();
      this.logger.log(`⏳ Injetando catálogo base de Pet Shop & Banho e Tosa no tenant...`);

      const petProducts = [
        // ── RAÇÕES CÃES E GATOS ───────────────────────────────────────────────
        { name: 'Ração Golden Fórmula Cães Adultos Frango e Arroz 15kg', ean: '7897348202363', ncm: '23091000', cest: '2100100', cat: 'Rações Cães', unit: 'UN', price: 164.90 },
        { name: 'Ração Premier Ambientes Internos Cães Filhotes 2,5kg', ean: '7897348204121', ncm: '23091000', cest: '2100100', cat: 'Rações Cães', unit: 'UN', price: 89.90 },
        { name: 'Ração Golden Gatos Castrados Salmão 10,1kg',            ean: '7897348205623', ncm: '23091000', cest: '2100100', cat: 'Rações Gatos', unit: 'UN', price: 179.90 },
        { name: 'Sachê Whiskas Gatos Adultos Carne ao Molho 85g',        ean: '7896029022610', ncm: '23091000', cest: '2100100', cat: 'Rações Gatos', unit: 'UN', price: 4.50 },

        // ── FARMÁCIA E ANTIPULGAS ─────────────────────────────────────────────
        { name: 'Antipulgas Simparic 20mg Cães 5,1 a 10kg (1 comp)',     ean: '7898048825520', ncm: '30049099', cest: '',        cat: 'Farmácia Veterinária', unit: 'UN', price: 98.00 },
        { name: 'Antipulgas Bravecto Cães 10 a 20kg',                    ean: '8713184142238', ncm: '30049099', cest: '',        cat: 'Farmácia Veterinária', unit: 'UN', price: 229.90 },
        { name: 'Vermífugo Drontal Plus Sabor Carne Cães até 10kg',      ean: '7891106910385', ncm: '30049099', cest: '',        cat: 'Farmácia Veterinária', unit: 'UN', price: 49.90 },

        // ── HIGIENE E ACESSÓRIOS ──────────────────────────────────────────────
        { name: 'Tapete Higiênico Super Secão 30 Unidades',              ean: '7898904627019', ncm: '48189090', cest: '',        cat: 'Higiene e Beleza', unit: 'PCT', price: 69.90 },
        { name: 'Areia Higiênica Pipicat Classic 4kg',                   ean: '7896006201113', ncm: '25081000', cest: '',        cat: 'Higiene e Beleza', unit: 'PCT', price: 19.90 },
        { name: 'Shampoo Neutro Pet Clean 700ml',                        ean: '7898574020013', ncm: '33079000', cest: '',        cat: 'Higiene e Beleza', unit: 'UN', price: 24.90 },

        // ── PETISCOS E BRINQUEDOS ─────────────────────────────────────────────
        { name: 'Bifinho Keldog Cães Adultos Carne 500g',                ean: '7896006299189', ncm: '23091000', cest: '2100100', cat: 'Petiscos e Ossos', unit: 'PCT', price: 27.90 },
        { name: 'Petisco Dreamies Gatos Sabor Queijo 40g',               ean: '7896029086698', ncm: '23091000', cest: '2100100', cat: 'Petiscos e Ossos', unit: 'UN', price: 9.90 },
      ];

      const uniqueCats = [...new Set(petProducts.map(p => p.cat))];
      await client.category.createMany({
        data: uniqueCats.map(name => ({ name })),
        skipDuplicates: true,
      });
      const tenantCategories = await client.category.findMany();
      const getCatId = (name: string) => tenantCategories.find(c => c.name === name)?.id;

      let inserted = 0;
      for (const p of petProducts) {
        const catId = getCatId(p.cat);
        if (!catId) continue;
        const existing = await client.product.findFirst({ where: { name: p.name } });
        if (existing) continue;

        await client.product.create({
          data: {
            name: p.name,
            barcode: p.ean || null,
            priceCost: 0,
            priceSell: p.price,
            stock: 15,
            categoryId: catId,
            ncm: p.ncm || null,
            cest: p.cest || null,
            active: true,
            unit: p.unit || 'UN',
          },
        });
        inserted++;
      }

      // Popular Serviços Padrão de Banho e Tosa na tabela pet_services
      const defaultServices = [
        { name: 'Banho Porte Pequeno', description: 'Banho completo com secagem, limpeza de ouvidos e corte de unhas.', durationMinutes: 45, price: 55.00, color: '#0d9488' },
        { name: 'Banho Porte Médio/Grande', description: 'Banho técnico com produtos hipoalergênicos e secagem.', durationMinutes: 60, price: 85.00, color: '#0284c7' },
        { name: 'Banho + Tosa Higiênica', description: 'Banho completo acompanhado de tosa higiênica nas áreas íntimas e patinhas.', durationMinutes: 75, price: 75.00, color: '#7c3aed' },
        { name: 'Banho + Tosa Completa (Máquina/Tesoura)', description: 'Estética completa da pelagem conforme padrão da raça.', durationMinutes: 90, price: 110.00, color: '#d97706' },
        { name: 'Hidratação Profunda de Pelagem', description: 'Tratamento reconstrutor para pelos longos ou ressecados.', durationMinutes: 30, price: 40.00, color: '#ec4899' },
      ];

      for (const svc of defaultServices) {
        const existingSvc = await client.petService.findFirst({ where: { name: svc.name } });
        if (!existingSvc) {
          await client.petService.create({ data: svc });
        }
      }

      this.logger.log(`✅ Catálogo Pet Shop inserido: ${inserted} produtos e ${defaultServices.length} serviços no banco ${databaseUrl}`);
    } catch (err: any) {
      this.logger.error(`❌ Erro ao popular produtos base Pet Shop: ${err.message}`, err.stack);
      throw err;
    } finally {
      await client.$disconnect();
    }
  }

  /** Define/atualiza o PIN de desconto do PDV (armazenado na tabela tenant_settings do banco do tenant) */
  async setDiscountPin(tenantId: string, pin: string) {
    const { databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    const hashed = await bcrypt.hash(pin, 10);
    await prisma.tenantSettings.upsert({
      where: { id: 'singleton' },
      update: { discountPin: hashed },
      create: { id: 'singleton', discountPin: hashed },
    });
    return { message: 'PIN de desconto configurado com sucesso.' };
  }

  /** Verifica se o PIN de desconto é válido */
  async verifyDiscountPin(tenantId: string, pin: string): Promise<boolean> {
    const { databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    const settings = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.discountPin) return false;
    return bcrypt.compare(pin, settings.discountPin);
  }

  /** Define/atualiza o PIN do Caixa para liberação de auditoria e visualização de valores */
  async setCashierPin(tenantId: string, pin: string) {
    const { databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    const hashed = await bcrypt.hash(pin, 10);
    try {
      await prisma.tenantSettings.upsert({
        where: { id: 'singleton' },
        update: { cashierPin: hashed },
        create: { id: 'singleton', cashierPin: hashed },
      });
    } catch (err: any) {
      if (err?.code === 'P2022' || err?.message?.includes('cashierPin') || err?.message?.includes('Unknown column')) {
        // Se a coluna ainda não existir no banco do tenant, adiciona automaticamente
        try {
          await prisma.$executeRawUnsafe('ALTER TABLE `tenant_settings` ADD COLUMN `cashierPin` VARCHAR(191) NULL');
          await prisma.tenantSettings.upsert({
            where: { id: 'singleton' },
            update: { cashierPin: hashed },
            create: { id: 'singleton', cashierPin: hashed },
          });
        } catch (alterErr) {
          this.logger.error(`Erro ao criar coluna cashierPin dinamicamente: ${alterErr.message}`);
          throw err;
        }
      } else {
        throw err;
      }
    }
    return { message: 'PIN do Caixa configurado com sucesso.' };
  }

  /** Verifica se o PIN informado é o PIN do Caixa ou PIN de um gerente */
  async verifyCashierPin(tenantId: string, pin: string): Promise<{
    authorized: boolean;
    authType: 'cashier_pin' | 'manager_pin';
    managerOpId?: string;
    managerName?: string;
  }> {
    const { databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    
    // 1. Tenta verificar contra o cashierPin do TenantSettings
    try {
      const settings = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' } });
      if (settings?.cashierPin && (await bcrypt.compare(pin, settings.cashierPin))) {
        return { authorized: true, authType: 'cashier_pin' };
      }
    } catch {
      // Caso a coluna ainda não exista antes da atualização do banco
    }

    // 2. Tenta verificar se o PIN bate com algum Operador com permissão de Gerente (isManager=true)
    try {
      const managers = await prisma.operator.findMany({
        where: { isManager: true, active: true },
      });
      for (const mgr of managers) {
        if (mgr.pin && (await bcrypt.compare(pin, mgr.pin))) {
          return {
            authorized: true,
            authType: 'manager_pin',
            managerOpId: mgr.id,
            managerName: mgr.name,
          };
        }
      }
    } catch {
      // Ignora erro
    }

    return { authorized: false, authType: 'cashier_pin' };
  }

  async deleteTenant(tenantId: string) {
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) throw new NotFoundException('Empresa não encontrada');

    // 1. Drop the tenant's database
    try {
      this.logger.log(`⚠️ Excluindo banco de dados: ${tenant.databaseName}`);
      await this.heartPrisma.$executeRawUnsafe(`DROP DATABASE \`${tenant.databaseName}\``);
      this.logger.log(`✅ Banco de dados ${tenant.databaseName} excluído com sucesso.`);
    } catch (e: any) {
      this.logger.error(`Falha ao excluir o banco de dados ${tenant.databaseName}: ${e.message}`);
      // Continuamos a exclusão do registro mesmo se o banco já não existir para evitar bloqueios
    }

    // 2. Delete the tenant record in the heart database
    await this.heartPrisma.tenant.delete({
      where: { id: tenantId }
    });

    return { success: true };
  }

  /**
   * Avança a data de vencimento em exatamente 1 mês preservando o dia original.
   * Trata corretamente dias 29/30/31 que não existem no mês destino (usa o último dia válido).
   */
  private addOneMonthSafe(date: Date): Date {
    const originalDay = date.getDate();
    const d = new Date(date);
    d.setDate(1); // Move pro dia 1 para evitar overflow ao mudar o mês
    d.setMonth(d.getMonth() + 1); // Avança 1 mês
    // Verifica quantos dias tem o mês destino
    const lastDayOfNextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDay, lastDayOfNextMonth));
    return d;
  }

  async registrarPagamento(tenantId: string, observacao?: string) {
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId }
    });
    if (!tenant) throw new NotFoundException('Empresa não encontrada');

    const vencimentoAntes = tenant.mensalidadeVencimento ? new Date(tenant.mensalidadeVencimento) : new Date();
    const vencimentoApos = this.addOneMonthSafe(vencimentoAntes);

    // Grava o log de pagamento e atualiza o vencimento atomicamente
    const [_, updatedTenant] = await this.heartPrisma.$transaction([
      this.heartPrisma.paymentLog.create({
        data: {
          tenantId,
          valor: Number(tenant.mensalidadeValor) || 0,
          vencimentoAntes,
          vencimentoApos,
          observacao: observacao || null,
        }
      }),
      this.heartPrisma.tenant.update({
        where: { id: tenantId },
        data: { mensalidadeVencimento: vencimentoApos }
      })
    ]);

    return updatedTenant;
  }

  async getPaymentHistory(tenantId: string) {
    return this.heartPrisma.paymentLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50, // retorna os últimos 50 pagamentos
    });
  }

  async getTenantUsers(tenantId: string) {
    const users = await this.heartPrisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      }
    });
    return users;
  }

  async createTenantUser(tenantId: string, data: { name: string; email: string; password: string; role: string }) {
    const tenant = await this.heartPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    // Verificar se já existe usuário com esse email
    const existing = await this.heartPrisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestException(`Já existe um usuário com o email ${data.email}.`);

    // Validar role permitido
    const allowedRoles = ['admin', 'operator', 'stockist'];
    if (!allowedRoles.includes(data.role)) {
      throw new BadRequestException(`Perfil inválido. Valores permitidos: ${allowedRoles.join(', ')}`);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.heartPrisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
        tenantId,
        active: true,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });

    this.logger.log(`[Users] Usuário criado: ${user.name} (${user.role}) para tenant ${tenant.name}`);
    return user;
  }

  async resetUserPassword(tenantId: string, userId: string, newPasswordRaw: string) {
    const user = await this.heartPrisma.user.findFirst({
      where: { id: userId, tenantId }
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
    return this.heartPrisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
  }

  async resetUserPin(tenantId: string, userId: string, newPin: string) {
    const user = await this.heartPrisma.user.findFirst({
      where: { id: userId, tenantId }
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    return this.heartPrisma.user.update({
      where: { id: userId },
      data: { pin: newPin }
    });
  }

  /**
   * Varre todos os tenants ativos e sincroniza produtos com EAN
   * para a tabela master_products do banco heart.
   * Atualiza nome, imagem e dados fiscais se o tenant tiver informações mais ricas.
   */
  async syncMasterCatalogFromTenants(): Promise<{ synced: number; tenants: number; errors: string[] }> {
    const allTenants = await this.heartPrisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, databaseUrl: true },
    });

    let synced = 0;
    let tenantsProcessed = 0;
    const errors: string[] = [];

    for (const tenant of allTenants) {
      if (!tenant.databaseUrl) continue;
      const client = new PrismaClient({
        datasources: { db: { url: tenant.databaseUrl } },
      });

      try {
        await client.$connect();

        // Pega todos os produtos com EAN e imagem ou dados fiscais válidos
        const products = await client.product.findMany({
          where: {
            barcode: { not: null },
            OR: [
              { imageUrl: { not: null } },
              { ncm: { not: null } },
            ],
          },
          select: {
            barcode: true,
            name: true,
            imageUrl: true,
            ncm: true,
            cest: true,
          },
        });

        for (const p of products) {
          if (!p.barcode) continue;

          // Busca se já existe no master
          const existing = await this.heartPrisma.masterProduct.findUnique({
            where: { ean: p.barcode },
          });

          if (!existing) {
            // Cria novo no master
            await this.heartPrisma.masterProduct.create({
              data: {
                ean: p.barcode,
                name: p.name,
                imageUrl: p.imageUrl || null,
                ncm: p.ncm || null,
                cest: (p.cest || null) as string | null,
                source: `tenant:${tenant.name}`,
              },
            });
            synced++;
          } else {
            // Atualiza se o tenant tem imagem e o master não tem, ou tem NCM e o master não
            const needsUpdate =
              (!existing.imageUrl && p.imageUrl) ||
              (!existing.ncm && p.ncm);

            if (needsUpdate) {
              await this.heartPrisma.masterProduct.update({
                where: { ean: p.barcode },
                data: {
                  imageUrl: existing.imageUrl || p.imageUrl || null,
                  ncm: existing.ncm || p.ncm || null,
                  cest: existing.cest || (p.cest as string | null) || null,
                },
              });
              synced++;
            }
          }
        }

        tenantsProcessed++;
        this.logger.log(`✅ Tenant "${tenant.name}": ${products.length} produtos verificados.`);
      } catch (err: any) {
        const msg = `Erro ao processar tenant "${tenant.name}": ${err.message}`;
        this.logger.warn(msg);
        errors.push(msg);
      } finally {
        await client.$disconnect();
      }
    }

    this.logger.log(`🎯 Sincronização completa: ${synced} produtos atualizados em ${tenantsProcessed} tenants.`);
    return { synced, tenants: tenantsProcessed, errors };
  }

  // ── SQL CLIENT ────────────────────────────────────────────────────────────
  async executeSqlQuery(sql: string, tenantId?: string, useHeart?: boolean): Promise<any> {
    const start = Date.now();
    const trimmed = sql.trim().replace(/;\s*$/, ''); // remove ; final para evitar erro de sintaxe

    const isSelect = /^SELECT\b/i.test(trimmed);
    const isShowOrDescribe = /^(SHOW|DESCRIBE|DESC|EXPLAIN)/i.test(trimmed);
    const isQuery = isSelect || isShowOrDescribe;
    const SQL_LIMIT = 500;

    // Selecionar o cliente Prisma adequado
    let prisma: any;
    let dbLabel: string;

    if (useHeart || !tenantId) {
      prisma = this.heartPrisma;
      dbLabel = 'heart';
    } else {
      const tenant = await this.heartPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new BadRequestException('Tenant não encontrado.');
      prisma = await this.tenantManager.getTenantClient(tenantId, tenant.databaseUrl);
      dbLabel = tenant.databaseName;
    }

    this.logger.log(`[SQL Client] Executando no banco "${dbLabel}": ${trimmed.substring(0, 120)}...`);

    try {
      if (isQuery) {
        // Adiciona LIMIT SOMENTE para queries SELECT que não possuem LIMIT explícito
        let finalSql = trimmed;
        if (isSelect && !/\bLIMIT\s+\d+/i.test(trimmed)) {
          finalSql = `${trimmed} LIMIT ${SQL_LIMIT}`;
        }

        const rows: any[] = await prisma.$queryRawUnsafe(finalSql);
        const durationMs = Date.now() - start;

        if (!rows || rows.length === 0) {
          return { type: 'query', columns: [], rows: [], rowCount: 0, durationMs };
        }

        const columns = Object.keys(rows[0]);
        const data = rows.map((row: any) =>
          columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return null;
            if (val instanceof Date) return val.toISOString();
            if (val instanceof Buffer) return `[Binary ${val.length}b]`;
            if (typeof val === 'bigint') return val.toString();
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
          })
        );

        return { type: 'query', columns, rows: data, rowCount: rows.length, durationMs, limited: isSelect && rows.length >= SQL_LIMIT };
      } else {
        const affected = await prisma.$executeRawUnsafe(trimmed);
        return { type: 'exec', rowsAffected: Number(affected), durationMs: Date.now() - start };
      }
    } catch (err: any) {
      this.logger.error(`[SQL Client] Erro no banco "${dbLabel}": ${err.message}`);
      throw new BadRequestException(err.message || 'Erro ao executar query SQL.');
    }
  }

}
