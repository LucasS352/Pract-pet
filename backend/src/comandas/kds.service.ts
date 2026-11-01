import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { assertKdsTransition } from './kds.rules';
import { ShortReadCache } from '../prisma/short-read-cache';

@Injectable()
export class KdsService {
  private readonly queueReads = new ShortReadCache();
  invalidateQueue() { this.queueReads.clear(); }
  constructor(
    private readonly heart: HeartPrismaService,
    private readonly manager: TenantConnectionManager,
    private readonly context: TenantContextService,
  ) {}

  async config(station?: string) {
    const tenant = await this.heart.tenant.findUnique({
      where: { id: this.context.get().tenantId },
      select: { modulos: true },
    });
    try {
      const modules =
        typeof tenant?.modulos === 'string'
          ? JSON.parse(tenant.modulos)
          : tenant?.modulos;
      const kdsEnabled = modules?.kds === true;
      const carvoariaEnabled = modules?.carvoaria === true;
      return { enabled: kdsEnabled || carvoariaEnabled, kdsEnabled, carvoariaEnabled,
        stations: [...(kdsEnabled ? ['KITCHEN', 'BAR', 'BAR_1', 'BAR_2', 'SERVICE'] : []), ...(carvoariaEnabled ? ['CARVOARIA'] : [])].filter(s => !station || station === 'WAITER' || s === station) };
    } catch {
      return { enabled: false, kdsEnabled: false, carvoariaEnabled: false, stations: [] as string[] };
    }
  }

  async enabled() { return (await this.config()).enabled; }

  private async client() {
    if (!(await this.enabled()))
      throw new ForbiddenException('KDS não está ativo para esta loja.');
    const { tenantId, databaseUrl } = this.context.get();
    return this.manager.getTenantClient(tenantId, databaseUrl);
  }

  async tickets(station?: string) {
    const prisma = await this.client();
    const config = await this.config(station);
    return this.queueReads.get(this.context.get().tenantId + ':' + config.stations.join(','), () => (prisma as any).comandaItem.findMany({
      where: {
        status: 'active',
        kdsStatus: { in: ['PENDING', 'PREPARING', 'READY'] },
        kdsDestination: { in: config.stations },
        comanda: { status: { in: ['open', 'waiting_payment'] } },
      },
      include: {
        product: { select: { name: true, preparationIngredients: true } },
        modifiers: true,
        createdBy: { select: { name: true } },
        comanda: {
          select: {
            id: true,
            number: true,
            responsibleWaiter: { select: { name: true } },
          },
        },
      },
      orderBy: [{ kdsSentAt: 'asc' }, { id: 'asc' }],
    }));
  }

  async update(itemIds: string[], status: string, station?: string) {
    if (
      !Array.isArray(itemIds) ||
      !itemIds.length ||
      itemIds.length > 100 ||
      itemIds.some((id) => typeof id !== 'string') ||
      new Set(itemIds).size !== itemIds.length
    ) {
      throw new BadRequestException('Informe de 1 a 100 itens distintos.');
    }
    if (!['PREPARING', 'READY', 'DELIVERED'].includes(status))
      throw new BadRequestException('Status KDS inválido.');
    const prisma = await this.client();
    const config = await this.config(station);
    const updated = await (prisma as any).$transaction(
      async (tx: any) => {
        const items = await tx.comandaItem.findMany({
          where: { id: { in: itemIds }, status: 'active' },
          include: { comanda: true },
        });
        if (items.length !== itemIds.length)
          throw new BadRequestException('Pedido não encontrado.');
        // Ordem estável evita deadlocks entre telas que enviam lotes diferentes.
        const comandaIds = [
          ...new Set<string>(items.map((item: any) => item.comandaId)),
        ].sort();
        const rows = await tx.$queryRaw(
          Prisma.sql`SELECT id, status FROM comandas WHERE id IN (${Prisma.join(comandaIds)}) ORDER BY id FOR UPDATE`,
        );
        if (rows.length !== comandaIds.length || rows.some((row: any) => !['open', 'waiting_payment'].includes(row.status)))
          throw new ConflictException('Comanda encerrada.');
        const waitingComandas = new Set<string>();
        const groups = new Map<number, any[]>();
        for (const item of items) {
          if (!config.stations.includes(item.kdsDestination)) throw new ForbiddenException('Estação não está ativa nesta loja.');
          if (!['open', 'waiting_payment'].includes(item.comanda.status))
            throw new ConflictException('Comanda encerrada.');
          assertKdsTransition(item.kdsStatus, status);
          if (
            status === 'DELIVERED' &&
            !item.serveImmediately &&
            item.kdsDestination !== 'KITCHEN' && item.kdsDestination !== 'CARVOARIA'
          ) {
            waitingComandas.add(item.comandaId);
          }
          const minutes = status === 'DELIVERED' && !item.timerStartedAt && !item.assetReturnedAt ? (item.timerMinutes || 0) : 0;
          if (!groups.has(minutes)) groups.set(minutes, []);
          groups.get(minutes)!.push(item);
        }
        if (waitingComandas.size) {
          const waiting = await tx.comandaItem.count({
              where: {
                comandaId: { in: [...waitingComandas] },
                status: 'active',
                kdsDestination: 'KITCHEN',
                kdsStatus: { in: ['PENDING', 'PREPARING'] },
              },
            });
            if (waiting)
              throw new BadRequestException(
                'Este item deve sair junto com a comida. Aguarde a cozinha ficar pronta.',
              );
        }
        const now = new Date();
        for (const [minutes, group] of groups) {
          const result = await tx.comandaItem.updateMany({
            where: { id: { in: group.map(item => item.id) }, status: 'active', kdsStatus: group[0].kdsStatus },
            data: {
              kdsStatus: status,
              ...(status === 'READY' ? { kdsReadyAt: now } : {}),
              ...(status === 'DELIVERED' ? { kdsDeliveredAt: now } : {}),
              ...(minutes ? { timerStartedAt: now, timerDueAt: new Date(now.getTime() + minutes * 60_000) } : {}),
            },
          });
          if (result.count !== group.length)
            throw new ConflictException(
              'Pedido atualizado em outra tela. Recarregue a fila.',
            );
        }
        return { updated: items.length };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    this.invalidateQueue();
    return updated;
  }
}
