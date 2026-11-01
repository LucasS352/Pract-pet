import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/heart-client';

@Injectable()
export class HeartPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(HeartPrismaService.name);

  async onModuleInit() {
    let retries = 5;
    let delay = 1000;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Conexão estabelecida com sucesso com o banco Heart.');
        break;
      } catch (err: any) {
        retries--;
        this.logger.warn(
          `Falha ao conectar no banco mestre (Heart): ${err.message}. Tentando novamente em ${delay}ms... (${retries} retentativas restantes)`
        );
        if (retries === 0) {
          this.logger.error('Não foi possível estabelecer conexão com o banco Heart após 5 tentativas.');
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
