import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { createHash, randomBytes } from 'crypto';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { hasTaxiDropoff, hasTaxiPickup, parseAppointmentTransport, taxiNotificationText } from './petshop-transport';

interface TenantWhatsappRuntime {
  tenantId: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
  qrCodeDataUrl: string | null;
  qrGeneratedAt: Date | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
  socket: any | null;
  connectingPromise: Promise<void> | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  lastSentAt: number;
  processingQueue: boolean;
}

const DEFAULT_NOTIFICATION_RULES = [
  {
    name: 'Confirmação Imediata de Agendamento',
    triggerType: 'APPOINTMENT_CONFIRMED',
    triggerMinutesBefore: null,
    includePhoto: false,
    active: true,
    messageTemplate:
      'Olá, {nome_tutor}! Confirmamos o agendamento de *{nome_pet}* para *{servico}* no dia *{data}* às *{hora}* na *{nome_loja}*.\n\nAcompanhe o atendimento ao vivo pelo link: {link_portal}',
  },
  {
    name: 'Lembrete 24h Antes do Atendimento',
    triggerType: 'BEFORE_APPOINTMENT',
    triggerMinutesBefore: 1440,
    includePhoto: false,
    active: true,
    messageTemplate:
      'Olá, {nome_tutor}! Passando para lembrar que amanhã ({data}) às *{hora}* temos o horário de *{nome_pet}* ({servico}) aqui na *{nome_loja}*. Esperamos vocês!',
  },
  {
    name: 'Lembrete 2h Antes do Atendimento',
    triggerType: 'BEFORE_APPOINTMENT',
    triggerMinutesBefore: 120,
    includePhoto: false,
    active: true,
    messageTemplate:
      'Olá, {nome_tutor}! Falta pouco para o horário de *{nome_pet}* ({servico}) hoje às *{hora}* na *{nome_loja}*. Até já!',
  },
  {
    name: 'Pet Pronto para Retirada',
    triggerType: 'PET_READY',
    triggerMinutesBefore: null,
    includePhoto: true,
    active: true,
    messageTemplate:
      'Olá, {nome_tutor}! *{nome_pet}* já está pronto(a), cheiroso(a) e aguardando você para retirada aqui na *{nome_loja}*!\n\nVeja os detalhes do cuidado no portal: {link_portal}',
  },
  {
    name: 'Alerta de Última Sessão do Pacote',
    triggerType: 'PACKAGE_LAST_SESSION',
    triggerMinutesBefore: null,
    includePhoto: false,
    active: true,
    messageTemplate:
      'Olá, {nome_tutor}! Hoje realizamos mais um atendimento do pacote de *{nome_pet}*. Restam *{saldo_pacote}* sessões disponíveis (validade até {validade_pacote}). Fale conosco na recepção caso deseje garantir a renovação com condições especiais!',
  },
  {
    name: 'Lembrete de Retorno (15 dias sem agendar)',
    triggerType: 'INACTIVE_CUSTOMER',
    triggerMinutesBefore: 15,
    includePhoto: false,
    active: true,
    messageTemplate:
      'Olá, {nome_tutor}! Já faz *{dias_sem_vir} dias* que não vemos *{nome_pet}* por aqui na *{nome_loja}*! Que tal agendar um horário para deixar {nome_pet} limpinho(a) e cheiroso(a) essa semana?',
  },
];

@Injectable()
export class PetshopWhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PetshopWhatsappService.name);
  private readonly runtimes = new Map<string, TenantWhatsappRuntime>();
  private cronRunning = false;

  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly heart: HeartPrismaService,
  ) {}

  async onModuleInit() {
    // Restaura em background sessões que já possuem credenciais salvas no disco
    setTimeout(() => {
      this.restorePersistedSessions().catch(err =>
        this.logger.warn(`Falha ao restaurar sessões WhatsApp na inicialização: ${err?.message}`),
      );
    }, 5000);
  }

  onModuleDestroy() {
    for (const rt of this.runtimes.values()) {
      if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
      try {
        rt.socket?.end?.(undefined);
      } catch {
        // ignore
      }
    }
  }

  private async prisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  private getSessionDir(tenantId: string): string {
    const safeId = String(tenantId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) throw new BadRequestException('Tenant inválido para sessão WhatsApp.');
    return path.resolve(process.cwd(), 'uploads', 'whatsapp-sessions', safeId);
  }

  private getOrCreateRuntime(tenantId: string): TenantWhatsappRuntime {
    let rt = this.runtimes.get(tenantId);
    if (!rt) {
      rt = {
        tenantId,
        status: 'DISCONNECTED',
        qrCodeDataUrl: null,
        qrGeneratedAt: null,
        connectedPhone: null,
        connectedName: null,
        lastError: null,
        socket: null,
        connectingPromise: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        lastSentAt: 0,
        processingQueue: false,
      };
      this.runtimes.set(tenantId, rt);
    }
    return rt;
  }

  private async restorePersistedSessions() {
    const baseDir = path.resolve(process.cwd(), 'uploads', 'whatsapp-sessions');
    if (!fs.existsSync(baseDir)) return;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const tenantId = entry.name;
      const credsFile = path.join(baseDir, tenantId, 'creds.json');
      if (!fs.existsSync(credsFile)) continue;

      const tenant = await this.heart.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, status: true, databaseUrl: true },
      });
      if (!tenant || tenant.status !== 'active') continue;

      this.startBaileysSession(tenant.id, tenant.databaseUrl, false).catch(err =>
        this.logger.warn(`Não foi possível reconectar sessão WhatsApp do tenant ${tenantId}: ${err?.message}`),
      );
    }
  }

  // ===========================================================================
  // 1. GERENCIAMENTO DE SESSÃO BAILEYS E QR CODE POR TENANT
  // ===========================================================================

  async getSessionStatus() {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.prisma();
    const rt = this.getOrCreateRuntime(tenantId);

    let dbSession: any = null;
    try {
      dbSession = await prisma.petshopWhatsappSession.findUnique({
        where: { id: 'singleton' },
      });
    } catch {
      // Caso a tabela ainda não tenha sido migrada via Sys-Init
    }

    return {
      tenantId,
      status: rt.status,
      qrCodeDataUrl: rt.status === 'QR_READY' ? rt.qrCodeDataUrl : null,
      qrGeneratedAt: rt.qrGeneratedAt ? rt.qrGeneratedAt.toISOString() : null,
      connectedPhone: rt.connectedPhone || dbSession?.connectedPhone || null,
      connectedName: rt.connectedName || dbSession?.connectedName || null,
      lastConnectedAt: dbSession?.lastConnectedAt || null,
      lastDisconnectedAt: dbSession?.lastDisconnectedAt || null,
      lastError: rt.lastError || dbSession?.lastDisconnectReason || null,
    };
  }

  async connectSession(forceReset = false) {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    const rt = this.getOrCreateRuntime(tenantId);

    if (forceReset) {
      await this.disconnectSession(true);
    }

    if (rt.status === 'CONNECTED' && rt.socket) {
      return this.getSessionStatus();
    }

    await this.startBaileysSession(tenantId, databaseUrl, true);

    // Aguarda até 4.5s pela geração do primeiro QR Code ou conexão imediata
    const deadline = Date.now() + 4500;
    while (
      Date.now() < deadline &&
      rt.status === 'CONNECTING' &&
      !rt.qrCodeDataUrl
    ) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return this.getSessionStatus();
  }

  async disconnectSession(clearCredentials = true) {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    const rt = this.getOrCreateRuntime(tenantId);

    if (rt.reconnectTimer) {
      clearTimeout(rt.reconnectTimer);
      rt.reconnectTimer = null;
    }

    if (rt.socket) {
      try {
        if (clearCredentials && rt.status === 'CONNECTED') {
          await rt.socket.logout().catch(() => {});
        }
        rt.socket.end(undefined);
      } catch {
        // ignore
      }
      rt.socket = null;
    }

    if (clearCredentials) {
      const sessionDir = this.getSessionDir(tenantId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    rt.status = 'DISCONNECTED';
    rt.qrCodeDataUrl = null;
    rt.qrGeneratedAt = null;
    rt.connectedPhone = null;
    rt.connectedName = null;
    rt.reconnectAttempts = 0;

    await this.persistSessionState(tenantId, databaseUrl, {
      status: 'DISCONNECTED',
      connectedPhone: null,
      connectedName: null,
      lastDisconnectedAt: new Date(),
      lastDisconnectReason: 'Desconectado manualmente pelo operador',
    });

    return this.getSessionStatus();
  }

  private async startBaileysSession(
    tenantId: string,
    databaseUrl: string,
    allowNewQr: boolean,
  ) {
    const rt = this.getOrCreateRuntime(tenantId);
    if (rt.connectingPromise) {
      return rt.connectingPromise;
    }

    rt.connectingPromise = (async () => {
      try {
        if (rt.reconnectTimer) {
          clearTimeout(rt.reconnectTimer);
          rt.reconnectTimer = null;
        }

        if (rt.socket) {
          try {
            rt.socket.end(undefined);
          } catch {
            // ignore
          }
          rt.socket = null;
        }

        const sessionDir = this.getSessionDir(tenantId);
        fs.mkdirSync(sessionDir, { recursive: true });

        rt.status = 'CONNECTING';
        rt.lastError = null;

        // Import dinâmico seguro do Baileys
        const baileys = await (Function('return import("@whiskeysockets/baileys")')() as Promise<any>);
        const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
        const {
          useMultiFileAuthState,
          DisconnectReason,
          fetchLatestBaileysVersion,
          Browsers,
        } = baileys;

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        let version: [number, number, number] = [2, 3000, 1015901307];
        try {
          const latest = await fetchLatestBaileysVersion();
          if (latest?.version) version = latest.version;
        } catch {
          // Usa fallback estável se não conseguir consultar versão remota
        }

        const pinoLikeSilentLogger = {
          level: 'silent',
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          child: () => pinoLikeSilentLogger,
        };

        const sock = makeWASocket({
          version,
          auth: state,
          printQRInTerminal: false,
          logger: pinoLikeSilentLogger as any,
          browser: Browsers?.ubuntu ? Browsers.ubuntu('Pract Pet SaaS') : ['Pract Pet', 'Chrome', '120.0'],
          syncFullHistory: false,
          markOnlineOnConnect: false,
          generateHighQualityLinkPreview: false,
        });

        rt.socket = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            if (!allowNewQr && rt.reconnectAttempts > 2) {
              // Evita ficar gerando QR infinito em background sem ação do usuário
              try {
                sock.end(undefined);
              } catch {}
              rt.status = 'DISCONNECTED';
              return;
            }
            try {
              const dataUrl = await QRCode.toDataURL(qr, {
                margin: 2,
                width: 300,
                color: { dark: '#0f172a', light: '#ffffff' },
              });
              rt.qrCodeDataUrl = dataUrl;
              rt.qrGeneratedAt = new Date();
              rt.status = 'QR_READY';
              rt.lastError = null;
              await this.persistSessionState(tenantId, databaseUrl, {
                status: 'QR_READY',
              });
            } catch (qrErr: any) {
              this.logger.error(`Erro ao gerar imagem QR Code para tenant ${tenantId}: ${qrErr?.message}`);
            }
          }

          if (connection === 'open') {
            const rawId = String(sock.user?.id || '');
            const cleanPhone = rawId.split(':')[0].split('@')[0].replace(/\D/g, '');
            const profileName = sock.user?.name || sock.user?.verifiedName || 'WhatsApp Conectado';

            rt.status = 'CONNECTED';
            rt.qrCodeDataUrl = null;
            rt.qrGeneratedAt = null;
            rt.connectedPhone = cleanPhone || null;
            rt.connectedName = profileName;
            rt.reconnectAttempts = 0;
            rt.lastError = null;

            this.logger.log(`WhatsApp conectado para tenant ${tenantId} (${cleanPhone})`);

            await this.persistSessionState(tenantId, databaseUrl, {
              status: 'CONNECTED',
              connectedPhone: cleanPhone || null,
              connectedName: profileName,
              lastConnectedAt: new Date(),
              lastDisconnectReason: null,
            });

            // Ao reconectar, processa mensagens pendentes elegíveis da fila deste tenant
            this.processTenantQueue(tenantId, databaseUrl).catch(() => {});
          }

          if (connection === 'close') {
            const statusCode =
              (lastDisconnect?.error as any)?.output?.statusCode ||
              (lastDisconnect?.error as any)?.statusCode;
            const reasonMsg =
              (lastDisconnect?.error as any)?.message || 'Conexão encerrada';

            const isLoggedOut = statusCode === DisconnectReason?.loggedOut || statusCode === 401;

            if (isLoggedOut) {
              this.logger.warn(`Sessão WhatsApp desconectada (loggedOut) para tenant ${tenantId}`);
              rt.status = 'DISCONNECTED';
              rt.qrCodeDataUrl = null;
              rt.connectedPhone = null;
              rt.connectedName = null;
              rt.socket = null;
              rt.lastError = 'Sessão encerrada pelo aparelho celular.';

              const dir = this.getSessionDir(tenantId);
              if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
              }

              await this.persistSessionState(tenantId, databaseUrl, {
                status: 'DISCONNECTED',
                connectedPhone: null,
                connectedName: null,
                lastDisconnectedAt: new Date(),
                lastDisconnectReason: rt.lastError,
              });
            } else {
              rt.status = 'DISCONNECTED';
              rt.socket = null;
              rt.lastError = reasonMsg;

              if (rt.reconnectAttempts < 5) {
                rt.reconnectAttempts += 1;
                const delayMs = Math.min(30_000, rt.reconnectAttempts * 4000);
                this.logger.log(
                  `Agendando reconexão WhatsApp para tenant ${tenantId} (tentativa ${rt.reconnectAttempts}/5 em ${delayMs}ms)`,
                );
                rt.reconnectTimer = setTimeout(() => {
                  this.startBaileysSession(tenantId, databaseUrl, allowNewQr).catch(() => {});
                }, delayMs);
              } else {
                await this.persistSessionState(tenantId, databaseUrl, {
                  status: 'DISCONNECTED',
                  lastDisconnectedAt: new Date(),
                  lastDisconnectReason: `Limite de tentativas de reconexão atingido: ${reasonMsg}`,
                });
              }
            }
          }
        });
      } catch (err: any) {
        rt.status = 'DISCONNECTED';
        rt.lastError = err?.message || 'Erro ao inicializar cliente WhatsApp.';
        this.logger.error(`Falha ao iniciar sessão Baileys para tenant ${tenantId}: ${rt.lastError}`);
      } finally {
        rt.connectingPromise = null;
      }
    })();

    return rt.connectingPromise;
  }

  private async persistSessionState(
    tenantId: string,
    databaseUrl: string,
    data: {
      status: string;
      connectedPhone?: string | null;
      connectedName?: string | null;
      lastConnectedAt?: Date;
      lastDisconnectedAt?: Date;
      lastDisconnectReason?: string | null;
    },
  ) {
    try {
      const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
      await prisma.petshopWhatsappSession.upsert({
        where: { id: 'singleton' },
        update: data,
        create: {
          id: 'singleton',
          ...data,
        },
      });
    } catch {
      // Ignora silenciosamente caso o schema ainda não tenha sido atualizado pelo Sys-Init
    }
  }

  private normalizeBrazilPhone(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  /**
   * Envia mensagem pelo socket Baileys do tenant com rate-limiting e verificação de número no WhatsApp
   */
  private async sendViaBaileys(
    tenantId: string,
    phone: string,
    text: string,
    mediaUrl?: string | null,
  ): Promise<{ providerMessageId: string }> {
    const rt = this.getOrCreateRuntime(tenantId);
    if (rt.status !== 'CONNECTED' || !rt.socket) {
      throw new Error('Sessão do WhatsApp não está conectada.');
    }

    const formattedPhone = this.normalizeBrazilPhone(phone);
    if (formattedPhone.length < 12) {
      throw new Error(`Número de telefone inválido para WhatsApp: ${phone}`);
    }

    // Respeita intervalo mínimo de 1.5s entre disparos do mesmo tenant para proteção da conta
    const elapsed = Date.now() - rt.lastSentAt;
    if (elapsed < 1500) {
      await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
    }

    let targetJid = `${formattedPhone}@s.whatsapp.net`;
    try {
      const [onWa] = await rt.socket.onWhatsApp(formattedPhone);
      if (onWa?.exists && onWa?.jid) {
        targetJid = onWa.jid;
      }
    } catch {
      // Prossegue com o JID padrão caso a consulta onWhatsApp oscile
    }

    let sentResult: any;
    if (mediaUrl) {
      try {
        const imageBuffer = await this.resolveMediaBuffer(mediaUrl);
        if (imageBuffer) {
          sentResult = await rt.socket.sendMessage(targetJid, {
            image: imageBuffer,
            caption: text,
          });
        } else {
          sentResult = await rt.socket.sendMessage(targetJid, { text });
        }
      } catch {
        // Se falhar o anexo da foto, garante o envio do texto
        sentResult = await rt.socket.sendMessage(targetJid, { text });
      }
    } else {
      sentResult = await rt.socket.sendMessage(targetJid, { text });
    }

    rt.lastSentAt = Date.now();
    const msgId = sentResult?.key?.id;
    if (!msgId) {
      throw new Error('O servidor WhatsApp não confirmou o identificador da mensagem enviada.');
    }

    return { providerMessageId: String(msgId) };
  }

  private async resolveMediaBuffer(mediaUrl: string): Promise<Buffer | null> {
    if (!mediaUrl) return null;
    const match = mediaUrl.match(/\/uploads\/images\/([a-zA-Z0-9-]+)/);
    if (match?.[1]) {
      const img = await this.heart.image.findUnique({ where: { id: match[1] } });
      if (img?.data) return Buffer.from(img.data);
    }
    return null;
  }

  async sendTestMessage(body: { phone: string; message?: string }) {
    const { tenantId } = this.tenantContext.get();
    const phone = String(body?.phone ?? '').trim();
    if (!phone) throw new BadRequestException('Informe o número de telefone para o teste.');

    const text =
      String(body?.message ?? '').trim() ||
      'Olá! Esta é uma mensagem de teste enviada pela Central WhatsApp do Pract Pet. Sua conexão está funcionando perfeitamente.';

    const rt = this.getOrCreateRuntime(tenantId);
    if (rt.status !== 'CONNECTED' || !rt.socket) {
      throw new BadRequestException(
        'O WhatsApp desta unidade não está conectado no momento. Escaneie o QR Code na aba Conexão primeiro.',
      );
    }

    try {
      const result = await this.sendViaBaileys(tenantId, phone, text);
      return {
        success: true,
        providerMessageId: result.providerMessageId,
        sentAt: new Date().toISOString(),
      };
    } catch (err: any) {
      throw new BadRequestException(
        `Falha ao enviar mensagem de teste: ${err?.message || 'Erro desconhecido'}`,
      );
    }
  }

  // ===========================================================================
  // 2. GESTÃO DE RÉGUAS DE DISPARO E TEMPLATES (SEÇÃO 5.3)
  // ===========================================================================

  async listRules() {
    try {
      const prisma = await this.prisma();
      const existing = await prisma.petshopNotificationRule.findMany({
        orderBy: [{ triggerType: 'asc' }, { triggerMinutesBefore: 'desc' }, { createdAt: 'asc' }],
      });

      if (existing.length === 0) {
        await prisma.petshopNotificationRule.createMany({
          data: DEFAULT_NOTIFICATION_RULES,
        });
        return await prisma.petshopNotificationRule.findMany({
          orderBy: [{ triggerType: 'asc' }, { triggerMinutesBefore: 'desc' }, { createdAt: 'asc' }],
        });
      }

      return existing;
    } catch (err: any) {
      this.logger.warn(`Aviso ao consultar regras de notificação WhatsApp: ${err?.message}`);
      return DEFAULT_NOTIFICATION_RULES.map((r, i) => ({
        id: `default-${i}`,
        ...r,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }
  }

  async createRule(data: any) {
    const prisma = await this.prisma();
    const name = String(data?.name ?? '').trim();
    if (!name) throw new BadRequestException('Informe o nome da regra de automação.');

    const triggerType = String(data?.triggerType ?? '').trim();
    const validTriggers = new Set([
      'APPOINTMENT_CONFIRMED',
      'BEFORE_APPOINTMENT',
      'PET_READY',
      'PACKAGE_LAST_SESSION',
      'PACKAGE_EXPIRING',
      'INACTIVE_CUSTOMER',
    ]);
    if (!validTriggers.has(triggerType)) {
      throw new BadRequestException('Tipo de gatilho inválido.');
    }

    let triggerMinutesBefore: number | null = null;
    if (triggerType === 'BEFORE_APPOINTMENT') {
      triggerMinutesBefore = Number(data?.triggerMinutesBefore ?? 120);
      if (
        !Number.isInteger(triggerMinutesBefore) ||
        triggerMinutesBefore < 5 ||
        triggerMinutesBefore > 10080
      ) {
        throw new BadRequestException(
          'A antecedência do lembrete deve ficar entre 5 minutos e 7 dias (10080 minutos).',
        );
      }
    } else if (triggerType === 'INACTIVE_CUSTOMER') {
      triggerMinutesBefore = Number(data?.triggerMinutesBefore ?? 15);
      if (
        !Number.isInteger(triggerMinutesBefore) ||
        triggerMinutesBefore < 1 ||
        triggerMinutesBefore > 365
      ) {
        throw new BadRequestException(
          'O prazo de inatividade deve ficar entre 1 e 365 dias.',
        );
      }
    }

    const messageTemplate = String(data?.messageTemplate ?? '').trim();
    if (messageTemplate.length < 5) {
      throw new BadRequestException('O texto da mensagem é obrigatório.');
    }

    return prisma.petshopNotificationRule.create({
      data: {
        name,
        triggerType,
        triggerMinutesBefore,
        messageTemplate,
        includePhoto: Boolean(data?.includePhoto),
        active: data?.active === undefined ? true : Boolean(data.active),
      },
    });
  }

  async updateRule(id: string, data: any) {
    const prisma = await this.prisma();
    const current = await prisma.petshopNotificationRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Regra de notificação não encontrada.');

    const triggerType =
      data?.triggerType !== undefined ? String(data.triggerType).trim() : current.triggerType;

    let triggerMinutesBefore = current.triggerMinutesBefore;
    if (triggerType === 'BEFORE_APPOINTMENT') {
      if (data?.triggerMinutesBefore !== undefined) {
        triggerMinutesBefore = Number(data.triggerMinutesBefore);
        if (
          !Number.isInteger(triggerMinutesBefore) ||
          triggerMinutesBefore < 5 ||
          triggerMinutesBefore > 10080
        ) {
          throw new BadRequestException('Antecedência inválida.');
        }
      } else if (!triggerMinutesBefore) {
        triggerMinutesBefore = 120;
      }
    } else if (triggerType === 'INACTIVE_CUSTOMER') {
      if (data?.triggerMinutesBefore !== undefined) {
        triggerMinutesBefore = Number(data.triggerMinutesBefore);
        if (
          !Number.isInteger(triggerMinutesBefore) ||
          triggerMinutesBefore < 1 ||
          triggerMinutesBefore > 365
        ) {
          throw new BadRequestException('O prazo de inatividade deve ficar entre 1 e 365 dias.');
        }
      } else if (!triggerMinutesBefore) {
        triggerMinutesBefore = 15;
      }
    } else {
      triggerMinutesBefore = null;
    }

    return prisma.petshopNotificationRule.update({
      where: { id },
      data: {
        name: data?.name !== undefined ? String(data.name).trim() : undefined,
        triggerType,
        triggerMinutesBefore,
        messageTemplate:
          data?.messageTemplate !== undefined ? String(data.messageTemplate).trim() : undefined,
        includePhoto:
          data?.includePhoto !== undefined ? Boolean(data.includePhoto) : undefined,
        active: data?.active !== undefined ? Boolean(data.active) : undefined,
      },
    });
  }

  async deleteRule(id: string) {
    const prisma = await this.prisma();
    const current = await prisma.petshopNotificationRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Regra não encontrada.');
    await prisma.petshopNotificationRule.delete({ where: { id } });
    return { success: true };
  }

  async listJobs(filters?: { status?: string; triggerType?: string; search?: string }) {
    try {
      const prisma = await this.prisma();
      const where: any = {};
      if (filters?.status && filters.status !== 'all') {
        where.status = filters.status;
      }
      if (filters?.triggerType && filters.triggerType !== 'all') {
        where.triggerType = filters.triggerType;
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim();
        where.OR = [
          { recipientName: { contains: q } },
          { recipientPhone: { contains: q } },
          { petName: { contains: q } },
          { messageContent: { contains: q } },
        ];
      }

      return await prisma.petshopNotificationJob.findMany({
        where,
        include: {
          rule: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    } catch (err: any) {
      this.logger.warn(`Aviso ao consultar jobs de notificação WhatsApp: ${err?.message}`);
      return [];
    }
  }

  async retryJob(jobId: string) {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    const prisma = await this.prisma();
    const job = await prisma.petshopNotificationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Registro de mensagem não encontrado.');
    if (job.status === 'SENT') {
      throw new BadRequestException('Esta mensagem já foi enviada com sucesso.');
    }

    await prisma.petshopNotificationJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 3600_000),
        lastError: null,
      },
    });

    await this.processTenantQueue(tenantId, databaseUrl);
    return prisma.petshopNotificationJob.findUnique({ where: { id: jobId } });
  }

  // ===========================================================================
  // 3. MOTOR DE DISPAROS, ENFILEIRAMENTO IDEMPOTENTE E PROCESSADOR DE FILA
  // ===========================================================================

  public renderTemplate(
    template: string,
    vars: {
      nome_tutor?: string;
      nome_pet?: string;
      servico?: string;
      data?: string;
      hora?: string;
      nome_loja?: string;
      endereco?: string;
      link_portal?: string;
      saldo_pacote?: string | number;
      validade_pacote?: string;
      dias_sem_vir?: string | number;
    },
  ): string {
    const replacements: Record<string, string> = {
      '{nome_tutor}': vars.nome_tutor || 'Tutor',
      '{nome_pet}': vars.nome_pet || 'Pet',
      '{servico}': vars.servico || 'Atendimento Pet',
      '{data}': vars.data || '',
      '{hora}': vars.hora || '',
      '{nome_loja}': vars.nome_loja || 'Pet Shop',
      '{endereco}': vars.endereco || '',
      '{link_portal}': vars.link_portal || '',
      '{saldo_pacote}': String(vars.saldo_pacote ?? ''),
      '{validade_pacote}': vars.validade_pacote || '',
      '{dias_sem_vir}': String(vars.dias_sem_vir ?? ''),
    };

    let result = template;
    for (const [tag, value] of Object.entries(replacements)) {
      result = result.split(tag).join(value);
    }
    return result.trim();
  }

  private async resolveShopMetadata(tenantId: string) {
    const tenant = await this.heart.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        nomeFantasia: true,
        razaoSocial: true,
        logradouro: true,
        numero: true,
        bairro: true,
        municipio: true,
        uf: true,
        tvPublicId: true,
      },
    });

    const shopName = tenant?.nomeFantasia || tenant?.name || tenant?.razaoSocial || 'Pract Pet';
    const addressParts = [
      tenant?.logradouro,
      tenant?.numero,
      tenant?.bairro,
      tenant?.municipio ? `${tenant.municipio}${tenant.uf ? `/${tenant.uf}` : ''}` : null,
    ].filter(Boolean);

    return {
      shopName,
      address: addressParts.join(', ') || 'Consulte nossa recepção',
      tvPublicId: tenant?.tvPublicId || null,
    };
  }

  private async ensureCustomerPortalLink(
    prisma: any,
    customerId: string,
    tvPublicId: string | null,
  ): Promise<string> {
    if (!tvPublicId) return '';
    const token = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    await prisma.petPortalAccessToken.create({
      data: { customerId, tokenHash, expiresAt },
    });
    const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3531';
    return `${baseUrl.replace(/\/$/, '')}/cliente-pet/${tvPublicId}#token=${token}`;
  }

  private formatBrDateAndTime(dateInput: Date | string) {
    const d = new Date(dateInput);
    const data = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
    const hora = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
    return { data, hora };
  }

  /**
   * Enfileira notificação de confirmação imediata ou Pet Pronto ao mudar status do agendamento
   */
  async enqueueAppointmentEvent(
    triggerType: 'APPOINTMENT_CONFIRMED' | 'PET_READY',
    appointmentId: string,
  ) {
    try {
      const { tenantId, databaseUrl } = this.tenantContext.get();
      const prisma = await this.prisma();

      const rules = await prisma.petshopNotificationRule.findMany({
        where: { triggerType, active: true },
      });
      if (!rules.length) return;

      const appointment = await prisma.petAppointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: true,
          pet: true,
          services: true,
        },
      });
      if (!appointment || !appointment.customer) return;
      if (appointment.customer.whatsappOptIn === false) return;

      const phone = this.normalizeBrazilPhone(appointment.customer.phone);
      if (phone.length < 12) return;

      const shopMeta = await this.resolveShopMetadata(tenantId);
      const portalLink = await this.ensureCustomerPortalLink(
        prisma,
        appointment.customerId,
        shopMeta.tvPublicId,
      );
      const { data, hora } = this.formatBrDateAndTime(appointment.startsAt);
      const serviceNames =
        appointment.services.map((s: any) => s.nameSnapshot).join(', ') || 'Atendimento Pet';

      for (const rule of rules) {
        const eventStamp =
          triggerType === 'APPOINTMENT_CONFIRMED'
            ? new Date(appointment.startsAt).toISOString()
            : appointment.readyAt
              ? new Date(appointment.readyAt).toISOString()
              : 'ready';

        const idempotencyKey = `${triggerType.toLowerCase()}:${rule.id}:${appointment.id}:${eventStamp}`.slice(
          0,
          190,
        );

        const existing = await prisma.petshopNotificationJob.findUnique({
          where: { idempotencyKey },
        });
        if (existing) continue;

        const templateContent = this.renderTemplate(rule.messageTemplate, {
          nome_tutor: appointment.customer.name.split(' ')[0] || appointment.customer.name,
          nome_pet: appointment.pet?.name || 'Pet',
          servico: serviceNames,
          data,
          hora,
          nome_loja: shopMeta.shopName,
          endereco: shopMeta.address,
          link_portal: portalLink,
        });
        const messageContent = taxiNotificationText(triggerType, parseAppointmentTransport(appointment.checkInNotes), {
          tutor: appointment.customer.name.split(' ')[0] || appointment.customer.name,
          pet: appointment.pet?.name || 'Pet', service: serviceNames, date: data, time: hora,
          shop: shopMeta.shopName, portalLink,
        }) || templateContent;

        const expiresAt =
          triggerType === 'APPOINTMENT_CONFIRMED'
            ? new Date(appointment.startsAt)
            : new Date(Date.now() + 12 * 3600_000);

        await prisma.petshopNotificationJob.create({
          data: {
            idempotencyKey,
            ruleId: rule.id,
            triggerType,
            customerId: appointment.customerId,
            petId: appointment.petId,
            appointmentId: appointment.id,
            recipientPhone: phone,
            recipientName: appointment.customer.name,
            petName: appointment.pet?.name || null,
            messageContent,
            mediaUrl: rule.includePhoto ? appointment.stagePhotoUrl || null : null,
            status: 'PENDING',
            scheduledFor: new Date(),
            expiresAt,
            nextAttemptAt: new Date(),
          },
        });
      }

      // Dispara processamento assíncrono sem bloquear a requisição HTTP do operador
      this.processTenantQueue(tenantId, databaseUrl).catch(() => {});
    } catch (err: any) {
      this.logger.warn(`Erro ao enfileirar evento ${triggerType}: ${err?.message}`);
    }
  }

  async sendTaxiDogDeparture(appointmentId: string, direction: 'pickup' | 'dropoff') {
    if (direction !== 'pickup' && direction !== 'dropoff') throw new BadRequestException('Direção do Táxi Dog inválida.');
    const { tenantId, databaseUrl } = this.tenantContext.get();
    const prisma = await this.prisma();
    const appointment = await prisma.petAppointment.findUnique({ where: { id: appointmentId }, include: { customer: true, pet: true } });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    const transport = parseAppointmentTransport(appointment.checkInNotes);
    if (!transport || (direction === 'pickup' ? !hasTaxiPickup(transport.mode) : !hasTaxiDropoff(transport.mode))) {
      throw new BadRequestException('Esta corrida não inclui a direção solicitada.');
    }
    if (direction === 'pickup' && appointment.status !== 'scheduled') throw new BadRequestException('A coleta exige um agendamento confirmado ainda não iniciado.');
    if (direction === 'dropoff' && appointment.status !== 'ready') throw new BadRequestException('A entrega exige um pet pronto.');
    if (appointment.customer.whatsappOptIn === false) throw new BadRequestException('Tutor não autorizou mensagens WhatsApp.');
    // Garante que o aviso de pet pronto entre na fila antes do aviso de saída,
    // inclusive quando o operador clica em seguida à mudança de status.
    if (direction === 'dropoff') await this.enqueueAppointmentEvent('PET_READY', appointmentId);
    const phone = this.normalizeBrazilPhone(appointment.customer.phone);
    if (phone.length < 12) throw new BadRequestException('Telefone do tutor inválido.');
    const shop = await this.resolveShopMetadata(tenantId);
    const pet = appointment.pet?.name || 'seu pet';
    const tutor = appointment.customer.name.split(' ')[0] || appointment.customer.name;
    const messageContent = direction === 'pickup'
      ? `Olá, ${tutor}! O Táxi Dog da *${shop.shopName}* está a caminho para buscar *${pet}* em ${transport.address}. Por favor, deixe o pet pronto para embarque.`
      : `Olá, ${tutor}! O Táxi Dog da *${shop.shopName}* saiu para levar *${pet}* de volta para ${transport.address}. Estamos a caminho!`;
    const triggerType = direction === 'pickup' ? 'TAXI_DOG_PICKUP_DEPARTURE' : 'TAXI_DOG_DROPOFF_DEPARTURE';
    const idempotencyKey = `taxi-departure:${direction}:${appointmentId}`;
    const job = await prisma.petshopNotificationJob.upsert({
      where: { idempotencyKey }, update: {},
      create: {
        idempotencyKey, triggerType, customerId: appointment.customerId, petId: appointment.petId,
        appointmentId, recipientPhone: phone, recipientName: appointment.customer.name,
        petName: pet, messageContent, status: 'PENDING', scheduledFor: new Date(),
        expiresAt: new Date(Date.now() + 2 * 3600_000), nextAttemptAt: new Date(),
      },
    });
    this.processTenantQueue(tenantId, databaseUrl).catch(() => {});
    return { id: job.id, status: job.status, alreadySent: job.status === 'SENT' };
  }

  async enqueueStagePhoto(appointmentId: string) {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    const prisma = await this.prisma();
    const appointment = await prisma.petAppointment.findUnique({ where: { id: appointmentId }, include: { customer: true, pet: true } });
    if (!appointment?.stagePhotoUrl || !appointment.customer || appointment.customer.whatsappOptIn === false) return;
    const phone = this.normalizeBrazilPhone(appointment.customer.phone);
    if (phone.length < 12) return;
    const history = Array.isArray(appointment.stageHistory) ? appointment.stageHistory as any[] : [];
    const last = history.at(-1);
    if (!last?.photoUrl || last.photoUrl !== appointment.stagePhotoUrl) return;
    const shop = await this.resolveShopMetadata(tenantId);
    const tutor = appointment.customer.name.split(' ')[0] || appointment.customer.name;
    const pet = appointment.pet?.name || 'seu pet';
    const label = String(last.label || appointment.status).trim();
    const notes = String(last.notes || '').trim();
    const messageContent = `Olá, ${tutor}! Veja a foto de *${pet}* na etapa *${label}* na *${shop.shopName}*.${notes ? `\n\nRecado: ${notes}` : ''}`;
    const idempotencyKey = `stage-photo:${appointmentId}:${history.length}`;
    await prisma.petshopNotificationJob.upsert({
      where: { idempotencyKey }, update: {},
      create: {
        idempotencyKey, triggerType: 'STAGE_PHOTO', customerId: appointment.customerId,
        petId: appointment.petId, appointmentId, recipientPhone: phone,
        recipientName: appointment.customer.name, petName: pet, messageContent,
        mediaUrl: appointment.stagePhotoUrl, status: 'PENDING', scheduledFor: new Date(),
        expiresAt: new Date(Date.now() + 12 * 3600_000), nextAttemptAt: new Date(),
      },
    });
    this.processTenantQueue(tenantId, databaseUrl).catch(() => {});
  }

  /**
   * Enfileira alerta quando o pacote do cliente chega na última sessão ou zera o saldo
   */
  async enqueuePackageLastSessionAlert(params: {
    customerPackageId: string;
    remainingAvailable: number;
  }) {
    try {
      const { tenantId, databaseUrl } = this.tenantContext.get();
      const prisma = await this.prisma();

      const rules = await prisma.petshopNotificationRule.findMany({
        where: { triggerType: 'PACKAGE_LAST_SESSION', active: true },
      });
      if (!rules.length) return;

      const contract = await prisma.customerPetPackage.findUnique({
        where: { id: params.customerPackageId },
        include: { customer: true, pet: true, items: true },
      });
      if (!contract || !contract.customer) return;
      if (contract.customer.whatsappOptIn === false) return;

      const phone = this.normalizeBrazilPhone(contract.customer.phone);
      if (phone.length < 12) return;

      const shopMeta = await this.resolveShopMetadata(tenantId);
      const { data: validadeStr } = this.formatBrDateAndTime(contract.expiresAt);
      const totalUsed = contract.items.reduce((sum, i) => sum + i.usedQuantity, 0);

      for (const rule of rules) {
        const idempotencyKey = `pkg_last:${rule.id}:${contract.id}:used_${totalUsed}`.slice(0, 190);
        const existing = await prisma.petshopNotificationJob.findUnique({
          where: { idempotencyKey },
        });
        if (existing) continue;

        const messageContent = this.renderTemplate(rule.messageTemplate, {
          nome_tutor: contract.customer.name.split(' ')[0] || contract.customer.name,
          nome_pet: contract.pet?.name || 'seu pet',
          servico: contract.planNameSnapshot,
          nome_loja: shopMeta.shopName,
          endereco: shopMeta.address,
          saldo_pacote: params.remainingAvailable,
          validade_pacote: validadeStr,
        });

        await prisma.petshopNotificationJob.create({
          data: {
            idempotencyKey,
            ruleId: rule.id,
            triggerType: 'PACKAGE_LAST_SESSION',
            customerId: contract.customerId,
            petId: contract.petId,
            customerPackageId: contract.id,
            recipientPhone: phone,
            recipientName: contract.customer.name,
            petName: contract.pet?.name || null,
            messageContent,
            status: 'PENDING',
            scheduledFor: new Date(),
            expiresAt: new Date(Date.now() + 7 * 86_400_000),
            nextAttemptAt: new Date(),
          },
        });
      }

      this.processTenantQueue(tenantId, databaseUrl).catch(() => {});
    } catch (err: any) {
      this.logger.warn(`Erro ao enfileirar alerta de pacote: ${err?.message}`);
    }
  }

  /**
   * Cron a cada minuto:
   * 1. Varre réguas BEFORE_APPOINTMENT e PACKAGE_EXPIRING dos tenants ativos com módulo petshop
   * 2. Processa a fila de mensagens pendentes (com retry e descarte de mensagens vencidas/canceladas)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledNotificationsCron() {
    if (this.cronRunning) return;
    this.cronRunning = true;

    try {
      const tenants = await this.heart.tenant.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          databaseUrl: true,
          modulos: true,
          name: true,
          nomeFantasia: true,
          logradouro: true,
          numero: true,
          bairro: true,
          municipio: true,
          uf: true,
          tvPublicId: true,
        },
      });

      for (const tenant of tenants) {
        const modulos =
          typeof tenant.modulos === 'string'
            ? JSON.parse(tenant.modulos)
            : (tenant.modulos as any) || {};
        if (!modulos?.petshop) continue;

        try {
          await this.evaluateScheduledRulesForTenant(tenant);
          await this.processTenantQueue(tenant.id, tenant.databaseUrl);
        } catch {
          // Isola falhas por tenant para nunca afetar os demais
        }
      }
    } catch (err: any) {
      this.logger.warn(`Erro no cron de notificações WhatsApp: ${err?.message}`);
    } finally {
      this.cronRunning = false;
    }
  }

  private async evaluateScheduledRulesForTenant(tenant: any) {
    const prisma = await this.tenantManager.getTenantClient(tenant.id, tenant.databaseUrl);
    const rules = await prisma.petshopNotificationRule.findMany({
      where: {
        active: true,
        triggerType: { in: ['BEFORE_APPOINTMENT', 'PACKAGE_EXPIRING', 'INACTIVE_CUSTOMER'] },
      },
    });
    if (!rules.length) return;

    const now = new Date();
    const shopName = tenant.nomeFantasia || tenant.name || 'Pract Pet';
    const address =
      [tenant.logradouro, tenant.numero, tenant.bairro, tenant.municipio].filter(Boolean).join(', ') ||
      '';

    for (const rule of rules) {
      if (rule.triggerType === 'BEFORE_APPOINTMENT' && rule.triggerMinutesBefore) {
        const targetStartMin = new Date(now.getTime() + (rule.triggerMinutesBefore - 5) * 60_000);
        const targetStartMax = new Date(now.getTime() + (rule.triggerMinutesBefore + 5) * 60_000);

        const upcomingAppointments = await prisma.petAppointment.findMany({
          where: {
            status: 'scheduled',
            startsAt: {
              gte: targetStartMin,
              lte: targetStartMax,
            },
          },
          include: {
            customer: true,
            pet: true,
            services: true,
          },
        });

        for (const app of upcomingAppointments) {
          if (!app.customer || app.customer.whatsappOptIn === false) continue;
          const phone = this.normalizeBrazilPhone(app.customer.phone);
          if (phone.length < 12) continue;

          const idempotencyKey = `reminder:${rule.id}:${app.id}:${new Date(app.startsAt).toISOString()}`.slice(
            0,
            190,
          );
          const exists = await prisma.petshopNotificationJob.findUnique({
            where: { idempotencyKey },
          });
          if (exists) continue;

          const { data, hora } = this.formatBrDateAndTime(app.startsAt);
          const serviceNames =
            app.services.map((s: any) => s.nameSnapshot).join(', ') || 'Atendimento Pet';

          const templateContent = this.renderTemplate(rule.messageTemplate, {
            nome_tutor: app.customer.name.split(' ')[0] || app.customer.name,
            nome_pet: app.pet?.name || 'Pet',
            servico: serviceNames,
            data,
            hora,
            nome_loja: shopName,
            endereco: address,
          });
          const messageContent = taxiNotificationText('BEFORE_APPOINTMENT', parseAppointmentTransport(app.checkInNotes), {
            tutor: app.customer.name.split(' ')[0] || app.customer.name,
            pet: app.pet?.name || 'Pet', service: serviceNames, date: data, time: hora,
            shop: shopName, minutesBefore: rule.triggerMinutesBefore,
          }) || templateContent;

          await prisma.petshopNotificationJob.create({
            data: {
              idempotencyKey,
              ruleId: rule.id,
              triggerType: 'BEFORE_APPOINTMENT',
              customerId: app.customerId,
              petId: app.petId,
              appointmentId: app.id,
              recipientPhone: phone,
              recipientName: app.customer.name,
              petName: app.pet?.name || null,
              messageContent,
              status: 'PENDING',
              scheduledFor: now,
              expiresAt: new Date(app.startsAt),
              nextAttemptAt: now,
            },
          });
        }
      }

      if (rule.triggerType === 'PACKAGE_EXPIRING') {
        const threeDaysAhead = new Date(now.getTime() + 3 * 86_400_000);
        const expiringPackages = await prisma.customerPetPackage.findMany({
          where: {
            status: 'active',
            expiresAt: {
              gte: now,
              lte: threeDaysAhead,
            },
          },
          include: {
            customer: true,
            pet: true,
            items: true,
          },
        });

        for (const pkg of expiringPackages) {
          if (!pkg.customer || pkg.customer.whatsappOptIn === false) continue;
          const totalAvailable = pkg.items.reduce((sum, i) => sum + i.availableQuantity, 0);
          if (totalAvailable <= 0) continue;

          const phone = this.normalizeBrazilPhone(pkg.customer.phone);
          if (phone.length < 12) continue;

          const expDateKey = new Date(pkg.expiresAt).toISOString().slice(0, 10);
          const idempotencyKey = `pkg_exp:${rule.id}:${pkg.id}:${expDateKey}`.slice(0, 190);
          const exists = await prisma.petshopNotificationJob.findUnique({
            where: { idempotencyKey },
          });
          if (exists) continue;

          const { data: validadeStr } = this.formatBrDateAndTime(pkg.expiresAt);
          const messageContent = this.renderTemplate(rule.messageTemplate, {
            nome_tutor: pkg.customer.name.split(' ')[0] || pkg.customer.name,
            nome_pet: pkg.pet?.name || 'seu pet',
            servico: pkg.planNameSnapshot,
            nome_loja: shopName,
            endereco: address,
            saldo_pacote: totalAvailable,
            validade_pacote: validadeStr,
          });

          await prisma.petshopNotificationJob.create({
            data: {
              idempotencyKey,
              ruleId: rule.id,
              triggerType: 'PACKAGE_EXPIRING',
              customerId: pkg.customerId,
              petId: pkg.petId,
              customerPackageId: pkg.id,
              recipientPhone: phone,
              recipientName: pkg.customer.name,
              petName: pkg.pet?.name || null,
              messageContent,
              status: 'PENDING',
              scheduledFor: now,
              expiresAt: new Date(pkg.expiresAt),
              nextAttemptAt: now,
            },
          });
        }
      }

      if (rule.triggerType === 'INACTIVE_CUSTOMER' && rule.triggerMinutesBefore) {
        const inactiveDays = Math.max(1, Number(rule.triggerMinutesBefore));
        const cutoffMax = new Date(now.getTime() - inactiveDays * 86_400_000);
        const cutoffMin = new Date(now.getTime() - (inactiveDays + 5) * 86_400_000);

        const activePets = await prisma.pet.findMany({
          where: {
            active: true,
            appointments: {
              some: {
                status: { notIn: ['cancelled', 'no_show'] },
                startsAt: { lte: cutoffMax },
              },
              none: {
                status: { notIn: ['cancelled', 'no_show'] },
                startsAt: { gt: cutoffMax },
              },
            },
          },
          include: {
            customer: true,
            appointments: {
              where: { status: { notIn: ['cancelled', 'no_show'] } },
              orderBy: { startsAt: 'desc' },
              take: 1,
              include: { services: true },
            },
          },
          take: 100,
        });

        for (const pet of activePets) {
          if (!pet.customer || pet.customer.whatsappOptIn === false) continue;
          const lastAppt = pet.appointments?.[0];
          if (!lastAppt || new Date(lastAppt.startsAt) < cutoffMin) continue;

          const phone = this.normalizeBrazilPhone(pet.customer.phone);
          if (phone.length < 12) continue;

          const lastDateKey = new Date(lastAppt.startsAt).toISOString().slice(0, 10);
          const idempotencyKey = `inactive:${rule.id}:${pet.id}:${lastDateKey}:${inactiveDays}d`.slice(0, 190);
          const exists = await prisma.petshopNotificationJob.findUnique({
            where: { idempotencyKey },
          });
          if (exists) continue;

          const daysSince = Math.max(
            inactiveDays,
            Math.floor((now.getTime() - new Date(lastAppt.startsAt).getTime()) / 86_400_000),
          );
          const { data: lastDataStr } = this.formatBrDateAndTime(lastAppt.startsAt);
          const lastServiceNames =
            lastAppt.services?.map((s: any) => s.nameSnapshot).join(', ') || 'Banho e Tosa';

          const messageContent = this.renderTemplate(rule.messageTemplate, {
            nome_tutor: pet.customer.name.split(' ')[0] || pet.customer.name,
            nome_pet: pet.name,
            servico: lastServiceNames,
            data: lastDataStr,
            nome_loja: shopName,
            endereco: address,
            dias_sem_vir: daysSince,
          });

          await prisma.petshopNotificationJob.create({
            data: {
              idempotencyKey,
              ruleId: rule.id,
              triggerType: 'INACTIVE_CUSTOMER',
              customerId: pet.customerId,
              petId: pet.id,
              appointmentId: lastAppt.id,
              recipientPhone: phone,
              recipientName: pet.customer.name,
              petName: pet.name,
              messageContent,
              status: 'PENDING',
              scheduledFor: now,
              expiresAt: new Date(now.getTime() + 5 * 86_400_000),
              nextAttemptAt: now,
            },
          });
        }
      }
    }
  }

  /**
   * Processa a fila persistente de notificações do tenant.
   * Revalida se cada mensagem ainda é válida antes de disparar (Requisito 6.1).
   */
  async processTenantQueue(tenantId: string, databaseUrl: string) {
    const rt = this.getOrCreateRuntime(tenantId);
    if (rt.processingQueue) return;
    rt.processingQueue = true;

    try {
      const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
      const now = new Date();

      // 1. Cancela mensagens que já perderam sua validade operacional (mesmo que desconectado)
      await prisma.petshopNotificationJob.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: { lt: now },
        },
        data: {
          status: 'CANCELLED_STALE',
          lastError: 'Mensagem descartada pois o horário limite do evento já passou.',
        },
      });

      // Se o WhatsApp não estiver conectado, mantém as mensagens válidas pendentes na fila sem travar
      if (rt.status !== 'CONNECTED' || !rt.socket) {
        return;
      }

      const pendingJobs = await prisma.petshopNotificationJob.findMany({
        where: {
          status: 'PENDING',
          nextAttemptAt: { lte: now },
        },
        include: {
          appointment: { select: { id: true, status: true, startsAt: true } },
          customer: { select: { id: true, whatsappOptIn: true } },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 15,
      });

      for (const job of pendingJobs) {
        // Revalida se o tutor desativou recebimento
        if (job.customer?.whatsappOptIn === false) {
          await prisma.petshopNotificationJob.update({
            where: { id: job.id },
            data: {
              status: 'CANCELLED_STALE',
              lastError: 'Tutor optou por não receber comunicações via WhatsApp.',
            },
          });
          continue;
        }

        // Revalida se o agendamento relacionado foi cancelado ou se o lembrete não faz mais sentido
        if (job.appointment) {
          if (['cancelled', 'no_show'].includes(job.appointment.status)) {
            await prisma.petshopNotificationJob.update({
              where: { id: job.id },
              data: {
                status: 'CANCELLED_STALE',
                lastError: `Agendamento foi alterado para ${job.appointment.status}.`,
              },
            });
            continue;
          }
          if (
            job.triggerType === 'BEFORE_APPOINTMENT' &&
            new Date(job.appointment.startsAt) <= new Date()
          ) {
            await prisma.petshopNotificationJob.update({
              where: { id: job.id },
              data: {
                status: 'CANCELLED_STALE',
                lastError: 'O horário do agendamento já iniciou ou passou.',
              },
            });
            continue;
          }
        }

        const attemptNumber = job.attempts + 1;
        const history = Array.isArray(job.attemptHistory) ? [...(job.attemptHistory as any[])] : [];

        try {
          const sendRes = await this.sendViaBaileys(
            tenantId,
            job.recipientPhone,
            job.messageContent,
            job.mediaUrl,
          );

          history.push({
            attempt: attemptNumber,
            at: new Date().toISOString(),
            status: 'SENT',
            providerMessageId: sendRes.providerMessageId,
          });

          await prisma.petshopNotificationJob.update({
            where: { id: job.id },
            data: {
              status: 'SENT',
              attempts: attemptNumber,
              sentAt: new Date(),
              providerMessageId: sendRes.providerMessageId,
              lastError: null,
              attemptHistory: history,
            },
          });
        } catch (sendErr: any) {
          const errMsg = sendErr?.message || 'Erro de comunicação no envio';
          history.push({
            attempt: attemptNumber,
            at: new Date().toISOString(),
            status: 'FAILED',
            error: errMsg,
          });

          const exhausted = attemptNumber >= job.maxAttempts;
          const backoffMinutes = attemptNumber === 1 ? 2 : attemptNumber === 2 ? 5 : 15;

          await prisma.petshopNotificationJob.update({
            where: { id: job.id },
            data: {
              status: exhausted ? 'FAILED' : 'PENDING',
              attempts: attemptNumber,
              nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
              lastError: errMsg,
              attemptHistory: history,
            },
          });
        }
      }
    } finally {
      rt.processingQueue = false;
    }
  }
}
