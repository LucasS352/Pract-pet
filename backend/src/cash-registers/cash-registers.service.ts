import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { Prisma } from '@prisma/client';
import { computeDataVersion, validateConferenceDetails } from './cash-registers-data-version';
import { verifyOperatorToken, verifyPinAuth, VerifiedPinAuth } from './cash-registers-auth.helper';

@Injectable()
export class CashRegistersService {
  constructor(
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService,
    private jwtService: JwtService,
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async openRegister(openingValue: number, operatorId?: string) {
    try {
      const { userId } = this.tenantContext.get();
      const prisma = await this.getPrisma();

      // Se não vier operatorId do frontend, tenta usar o userId do token (fallback)
      const currentOpId = operatorId || userId;

      return await prisma.$transaction(async (tx) => {
        const existing = await tx.cashRegister.findFirst({
          where: { status: 'open', operatorId: currentOpId }
        });

        if (existing) {
          throw new BadRequestException(`Você já possui um caixa aberto. Feche-o antes de abrir um novo.`);
        }

        const lastRegister = await tx.cashRegister.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true }
        });
        const nextCode = (lastRegister?.code ?? 0) + 1;

        return await tx.cashRegister.create({
          data: {
            code: nextCode,
            operatorId: currentOpId,
            openingValue,
            status: 'open'
          }
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Erro no banco: ${error.message}`);
    }
  }

  async closeRegister(
    id: string,
    closingValue: number | null,
    closingDetails: any,
    opToken?: string,
    pinToken?: string,
    user?: any
  ) {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();

    // 1. Validar operador executor (ou administrador com role admin)
    const executor = await verifyOperatorToken(this.jwtService, prisma, opToken, tenantId, user);

    // 2. Se executor não for gerente e enviou PIN token, valida PIN auth
    let pinAuth: VerifiedPinAuth | undefined;
    if (!executor.isManager && pinToken) {
      pinAuth = await verifyPinAuth(this.jwtService, prisma, pinToken, tenantId, id);
    }

    // 3. Buscar caixa
    const reg = await prisma.cashRegister.findUnique({
      where: { id },
      select: { id: true, status: true, operatorId: true },
    });
    if (!reg) throw new NotFoundException('Caixa não encontrado.');
    if (reg.status !== 'open') throw new BadRequestException('Caixa não está aberto.');

    // 4. Operador comum sem PIN só pode fechar o próprio caixa
    if (!executor.isManager && !pinAuth) {
      if (reg.operatorId && reg.operatorId !== executor.opId) {
        throw new ForbiddenException('Você só pode fechar o seu próprio caixa.');
      }
    }

    // 5. Fechamento Cego (closingValue === null)
    if (closingValue === null || closingValue === undefined) {
      const updateRes = await prisma.cashRegister.updateMany({
        where: { id, status: 'open' },
        data: {
          status: 'closed',
          closingTime: new Date(),
          closingValue: null,
          closingDetails: null,
        },
      });
      if (updateRes.count === 0) {
        throw new BadRequestException('Caixa não está mais aberto ou já foi fechado.');
      }
      return prisma.cashRegister.findUnique({ where: { id } });
    }

    // 6. Fechamento com Valores Declarados (exige gerente ou PIN de autorização)
    if (!executor.isManager && !pinAuth) {
      throw new ForbiddenException('Declarar valores no fechamento requer permissão de gerente ou autorização por PIN.');
    }

    if (closingDetails) {
      validateConferenceDetails(closingDetails, false);
    }

    const serializedDetails = closingDetails ? JSON.stringify(closingDetails) : null;

    return await prisma.$transaction(async (tx) => {
      const updateRes = await tx.cashRegister.updateMany({
        where: { id, status: 'open' },
        data: {
          status: 'closed',
          closingTime: new Date(),
          closingValue: Number(closingValue),
          closingDetails: serializedDetails,
        },
      });

      if (updateRes.count === 0) {
        throw new BadRequestException('Caixa não está mais aberto ou já foi fechado.');
      }

      if (serializedDetails) {
        await tx.cashRegisterConferenceRevision.create({
          data: {
            cashRegisterId: id,
            details: serializedDetails,
            savedByUserId: user && (user.role === 'admin' || user.role === 'superadmin') ? user.sub : null,
            savedByOpId: executor.opId,
            savedByOpName: executor.opName,
            pinAuthType: pinAuth?.authType ?? (user && (user.role === 'admin' || user.role === 'superadmin') ? 'ADMIN_SESSION' : null),
            pinAuthManagerId: pinAuth?.managerOpId ?? null,
            pinAuthManagerName: pinAuth?.managerName ?? null,
          },
        });
      }

      return tx.cashRegister.findUnique({ where: { id } });
    });
  }

  async auditRegister(
    id: string,
    closingValue: number,
    closingDetails: any,
    opToken?: string,
    pinToken?: string,
    user?: any
  ) {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();

    const executor = await verifyOperatorToken(this.jwtService, prisma, opToken, tenantId, user);

    let pinAuth: VerifiedPinAuth | undefined;
    if (!executor.isManager) {
      pinAuth = await verifyPinAuth(this.jwtService, prisma, pinToken, tenantId, id);
    }

    if (closingValue === undefined || closingValue === null || isNaN(Number(closingValue))) {
      throw new BadRequestException('closingValue deve ser um número válido.');
    }

    validateConferenceDetails(closingDetails, true);

    try {
      return await prisma.$transaction(async (tx) => {
        const register = await tx.cashRegister.findUnique({
          where: { id },
          select: { id: true, status: true, closingValue: true },
        });

        if (!register) throw new NotFoundException('Caixa não encontrado.');
        if (register.status !== 'closed') throw new BadRequestException('Caixa não está fechado.');
        if (register.closingValue !== null && register.closingValue !== undefined) {
          throw new BadRequestException('Caixa já foi auditado e concluído anteriormente. Não é permitido sobrescrever.');
        }

        const sales = await tx.sale.findMany({
          where: { cashRegisterId: id, NOT: { source: 'ajuste_fiscal' } },
          include: { payments: true },
        });
        const movements = await tx.cashMovement.findMany({
          where: { cashRegisterId: id },
        });

        const currentVersion = computeDataVersion(sales, movements);
        if (closingDetails.dataVersion !== currentVersion) {
          throw new HttpException({
            message: 'Os dados do caixa divergiram durante a conferência. Por favor, revise os valores.',
            errorSource: 'version_mismatch',
            currentDataVersion: currentVersion,
          }, HttpStatus.CONFLICT);
        }

        const serializedDetails = JSON.stringify(closingDetails);

        const updateRes = await tx.cashRegister.updateMany({
          where: { id, status: 'closed', closingValue: null },
          data: {
            closingValue: Number(closingValue),
            closingDetails: serializedDetails,
          },
        });

        if (updateRes.count === 0) {
          throw new BadRequestException('Caixa já foi auditado simultaneamente por outro processo.');
        }

        await tx.cashRegisterConferenceRevision.create({
          data: {
            cashRegisterId: id,
            details: serializedDetails,
            systemSnap: JSON.stringify({ currentVersion, closingValue }),
            savedByUserId: user && (user.role === 'admin' || user.role === 'superadmin') ? user.sub : null,
            savedByOpId: executor.opId,
            savedByOpName: executor.opName,
            pinAuthType: pinAuth?.authType ?? (user && (user.role === 'admin' || user.role === 'superadmin') ? 'ADMIN_SESSION' : null),
            pinAuthManagerId: pinAuth?.managerOpId ?? null,
            pinAuthManagerName: pinAuth?.managerName ?? null,
          },
        });

        return tx.cashRegister.findUnique({ where: { id } });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new HttpException({
          message: 'Conflito de concorrência detectado no banco de dados. Tente novamente.',
          errorSource: 'version_mismatch',
        }, HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async saveConference(
    id: string,
    conferenceDetails: any,
    opToken?: string,
    pinToken?: string,
    user?: any
  ) {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();

    const executor = await verifyOperatorToken(this.jwtService, prisma, opToken, tenantId, user);

    let pinAuth: VerifiedPinAuth | undefined;
    if (!executor.isManager) {
      pinAuth = await verifyPinAuth(this.jwtService, prisma, pinToken, tenantId, id);
    }

    validateConferenceDetails(conferenceDetails, true);

    try {
      return await prisma.$transaction(async (tx) => {
        const register = await tx.cashRegister.findUnique({
          where: { id },
          select: { id: true, status: true },
        });

        if (!register) throw new NotFoundException('Caixa não encontrado.');
        if (register.status !== 'open') throw new BadRequestException('Não é possível salvar conferência parcial em caixa já fechado.');

        const sales = await tx.sale.findMany({
          where: { cashRegisterId: id, NOT: { source: 'ajuste_fiscal' } },
          include: { payments: true },
        });
        const movements = await tx.cashMovement.findMany({
          where: { cashRegisterId: id },
        });

        const currentVersion = computeDataVersion(sales, movements);
        if (conferenceDetails.dataVersion !== currentVersion) {
          throw new HttpException({
            message: 'Novas vendas ou movimentações foram registradas durante a conferência. Por favor, revise os valores antes de salvar.',
            errorSource: 'version_mismatch',
            currentDataVersion: currentVersion,
          }, HttpStatus.CONFLICT);
        }

        const serializedDetails = JSON.stringify(conferenceDetails);
        const systemSnap = JSON.stringify({
          dataVersion: currentVersion,
          savedAt: new Date().toISOString(),
        });

        const updateRes = await tx.cashRegister.updateMany({
          where: { id, status: 'open' },
          data: {
            conferenceDetails: serializedDetails,
            conferenceSavedAt: new Date(),
            conferenceSystemSnap: systemSnap,
          },
        });

        if (updateRes.count === 0) {
          throw new BadRequestException('Caixa não está mais aberto.');
        }

        await tx.cashRegisterConferenceRevision.create({
          data: {
            cashRegisterId: id,
            details: serializedDetails,
            systemSnap,
            savedByUserId: user && (user.role === 'admin' || user.role === 'superadmin') ? user.sub : null,
            savedByOpId: executor.opId,
            savedByOpName: executor.opName,
            pinAuthType: pinAuth?.authType ?? (user && (user.role === 'admin' || user.role === 'superadmin') ? 'ADMIN_SESSION' : null),
            pinAuthManagerId: pinAuth?.managerOpId ?? null,
            pinAuthManagerName: pinAuth?.managerName ?? null,
          },
        });

        return {
          success: true,
          savedAt: new Date(),
          dataVersion: currentVersion,
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new HttpException({
          message: 'Conflito de concorrência detectado. Tente novamente.',
          errorSource: 'version_mismatch',
        }, HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async getCurrentRegister(operatorId?: string) {
    const { userId } = this.tenantContext.get();
    const currentOpId = operatorId || userId;
    if (!currentOpId) return null;

    const prisma = await this.getPrisma();
    const current = await prisma.cashRegister.findFirst({
      where: { status: 'open', operatorId: currentOpId },
      orderBy: { openingTime: 'desc' },
    });

    return current || null;
  }

  async addMovement(registerId: string, type: 'IN' | 'OUT', value: number, reason?: string) {
    const prisma = await this.getPrisma();
    const register = await prisma.cashRegister.findUnique({ where: { id: registerId } });
    if (!register || register.status !== 'open') throw new BadRequestException('Caixa fechado ou inexistente');

    return prisma.cashMovement.create({
      data: { cashRegisterId: registerId, type, value, reason }
    });
  }

  async findAll() {
    const prisma = await this.getPrisma();
    const registers = await prisma.cashRegister.findMany({
      orderBy: { openingTime: 'desc' },
      include: {
        operator: { select: { id: true, name: true, isManager: true } },
        sales: {
          where: { NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
          select: { total: true }
        }
      }
    });

    return registers.map(reg => {
      let totalSales = reg.sales.reduce((acc, s) => acc + Number(s.total || 0), 0);
      let closingDetailsParsed: any = null;
      if (reg.closingDetails) {
        try {
          closingDetailsParsed = typeof reg.closingDetails === 'string' ? JSON.parse(reg.closingDetails) : reg.closingDetails;
          if (closingDetailsParsed?.totalVendasAjustado != null) {
            totalSales = Number(closingDetailsParsed.totalVendasAjustado);
          }
        } catch {
          // fallback
        }
      }

      const { sales, ...rest } = reg;
      return {
        ...rest,
        totalSales,
        closingDetails: closingDetailsParsed,
      };
    });
  }

  async getReport(id: string) {
    const prisma = await this.getPrisma();
    const register = await prisma.cashRegister.findUnique({
      where: { id },
      include: { operator: { select: { id: true, name: true, isManager: true } } }
    });
    if (!register) throw new BadRequestException('Caixa não encontrado');

    const sales = await prisma.sale.findMany({
      where: { cashRegisterId: id, NOT: { source: 'ajuste_fiscal' } },
      include: { payments: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    });

    // Matemática Segura (Prisma.Decimal) para evitar perda de precisão flutuante (0.1 + 0.2 != 0.3)
    let totalDinheiro = new Prisma.Decimal(0);
    let totalPix = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    let totalDebito = new Prisma.Decimal(0);
    // Mapa para métodos customizados: { methodKey -> { label, total } }
    const customMethodTotals: Record<string, { label: string; total: Prisma.Decimal }> = {};

    sales.forEach(sale => {
      if (sale.status === 'cancelled' || sale.source === 'ajuste_fiscal') return;
      sale.payments.forEach((p: any) => {
        const v = new Prisma.Decimal(p.value as any);
        if (p.method === 'dinheiro')      totalDinheiro = totalDinheiro.add(v);
        else if (p.method === 'pix')      totalPix      = totalPix.add(v);
        else if (p.method === 'credito')  totalCredito  = totalCredito.add(v);
        else if (p.method === 'debito')   totalDebito   = totalDebito.add(v);
        else if (p.method !== 'consumo_funcionario') {
          // Método customizado: usa label salvo ou o próprio method como fallback
          const key = p.method;
          const labelName = p.label || p.method;
          if (!customMethodTotals[key]) {
            customMethodTotals[key] = { label: labelName, total: new Prisma.Decimal(0) };
          }
          customMethodTotals[key].total = customMethodTotals[key].total.add(v);
        }
      });
    });

    const movements = await prisma.cashMovement.findMany({
      where: { cashRegisterId: id },
      orderBy: { createdAt: 'desc' }
    });

    let totalSuprimentos = new Prisma.Decimal(0);
    let totalSangrias = new Prisma.Decimal(0);

    movements.forEach((m: any) => {
      const mv = new Prisma.Decimal(m.value as any);
      if (m.type === 'IN')  totalSuprimentos = totalSuprimentos.add(mv);
      if (m.type === 'OUT') totalSangrias    = totalSangrias.add(mv);
    });

    const openingValue = new Prisma.Decimal(register.openingValue as any);
    
    // Total Cartão = Crédito + Débito
    const totalCartao = totalCredito.add(totalDebito);
    // Total Customizado (iFood, Ticket, etc.)
    let totalCustom = new Prisma.Decimal(0);
    Object.values(customMethodTotals).forEach(m => { totalCustom = totalCustom.add(m.total); });
    // Total Vendas = Dinheiro + Pix + Cartão + Custom
    const totalVendas = totalDinheiro.add(totalPix).add(totalCartao).add(totalCustom);
    // Dinheiro Esperado na Gaveta = Abertura + Vendas(Dinheiro) + Suprimentos - Sangrias
    const expectedDinheiro = openingValue.add(totalDinheiro).add(totalSuprimentos).sub(totalSangrias);

    // Serializa métodos customizados para JSON
    const customMethodsSummary = Object.entries(customMethodTotals).map(([key, val]) => ({
      method: key,
      label: val.label,
      total: val.total.toNumber(),
    }));

    let closingDetailsParsed: any = null;
    if (register.closingDetails) {
      try {
        closingDetailsParsed = typeof register.closingDetails === 'string' ? JSON.parse(register.closingDetails) : register.closingDetails;
      } catch {
        closingDetailsParsed = null;
      }
    }

    let conferenceDetailsParsed: any = null;
    if (register.conferenceDetails) {
      try {
        conferenceDetailsParsed = typeof register.conferenceDetails === 'string'
          ? JSON.parse(register.conferenceDetails)
          : register.conferenceDetails;
      } catch {
        conferenceDetailsParsed = null;
      }
    }

    const dataVersion = computeDataVersion(sales, movements);

    let conferenceIsStale = false;
    if (register.conferenceSavedAt && register.conferenceSystemSnap) {
      try {
        const snap = JSON.parse(register.conferenceSystemSnap);
        if (snap.dataVersion && snap.dataVersion !== dataVersion) {
          conferenceIsStale = true;
        }
      } catch {
        conferenceIsStale = false;
      }
    }

    const revisions = await prisma.cashRegisterConferenceRevision.findMany({
      where: { cashRegisterId: id },
      orderBy: { savedAt: 'desc' },
      take: 20,
    });

    const conferenceRevisions = revisions.map((rev: any) => {
      let parsedDetails = null;
      try { parsedDetails = JSON.parse(rev.details); } catch { parsedDetails = rev.details; }
      return {
        id: rev.id,
        savedAt: rev.savedAt,
        savedByOpName: rev.savedByOpName,
        pinAuthType: rev.pinAuthType,
        pinAuthManagerName: rev.pinAuthManagerName,
        details: parsedDetails,
      };
    });

    return {
      register: {
        ...register,
        closingDetails: closingDetailsParsed,
        conferenceDetails: conferenceDetailsParsed,
      },
      report: {
        totalDinheiro: totalDinheiro.toNumber(),
        totalPix: totalPix.toNumber(),
        totalCredito: totalCredito.toNumber(),
        totalDebito: totalDebito.toNumber(),
        totalCartao: totalCartao.toNumber(),
        totalCustom: totalCustom.toNumber(),
        customMethods: customMethodsSummary,
        totalVendas: totalVendas.toNumber(),
        totalSuprimentos: totalSuprimentos.toNumber(),
        totalSangrias: totalSangrias.toNumber(),
        countSales: sales.filter(s => s.status !== 'cancelled').length,
        expectedDinheiro: expectedDinheiro.toNumber(),
        salesDetails: sales,
        movements,
        closingDetails: closingDetailsParsed,
        dataVersion,
        conferenceDetails: conferenceDetailsParsed,
        conferenceSavedAt: register.conferenceSavedAt,
        conferenceIsStale,
        conferenceRevisions,
      }
    };
  }
}
