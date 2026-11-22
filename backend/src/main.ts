import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createRateLimiter, securityHeaders } from './common/security/security';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Falha rápido se variáveis essenciais não estiverem definidas (evita subir inseguro). */
function assertRequiredEnv(logger: Logger) {
  const required = ['JWT_SECRET', 'DATABASE_URL_HEART'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    logger.error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`);
    process.exit(1);
  }
  if ((process.env.JWT_SECRET ?? '').length < 32) {
    logger.warn('JWT_SECRET tem menos de 32 caracteres. Use um segredo longo e aleatório.');
  }
  if (!process.env.SETUP_PIN) {
    logger.warn('SETUP_PIN não definido: o painel sys-init ficará inacessível.');
  }
}

/** Origens permitidas: CORS_ORIGINS (separadas por vírgula) + PUBLIC_APP_URL. Requisições same-origin (via nginx) não dependem disso. */
function buildCorsOrigins(): (string | RegExp)[] {
  const list = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (process.env.PUBLIC_APP_URL) {
    try {
      list.push(new URL(process.env.PUBLIC_APP_URL).origin);
    } catch {
      /* ignora URL inválida */
    }
  }
  return [...list, /^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/, /^capacitor:\/\/localhost$/];
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  assertRequiredEnv(logger);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Atrás do nginx: usa o IP real do cliente (X-Forwarded-For) para rate limit
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);

  const minute = 60_000;
  const normPath = (req: any) => String(req.path || '').replace(/\/+$/, '') || '/';
  app.use(
    createRateLimiter([
      {
        name: 'pin-check',
        match: req => req.method === 'POST' && normPath(req).endsWith('/tenants/setup/validate-pin'),
        windowMs: 15 * minute,
        max: 10,
        message: 'Muitas tentativas de PIN. Aguarde alguns minutos.',
      },
      {
        name: 'pin-verify',
        match: req =>
          req.method === 'POST' &&
          (/\/api\/tenants\/me\/verify-(discount|cashier)-pin$/.test(normPath(req)) ||
            /^\/api\/v1\/comandas\/[^/]+\/authorize$/.test(normPath(req))),
        windowMs: 15 * minute,
        max: 15,
        message: 'Muitas tentativas de PIN. Aguarde alguns minutos.',
      },
      {
        name: 'auth',
        match: req => req.method === 'POST' && /\/api\/auth\/(login|operator-login|station-login)$/.test(normPath(req)),
        windowMs: minute,
        max: 30,
        message: 'Muitas tentativas de login. Aguarde um minuto e tente novamente.',
      },
      {
        name: 'setup',
        match: req => /\/api\/(tenants\/setup|groups\/setup|leads|sys-init|integrations\/(setup|ifood))/.test(normPath(req)),
        windowMs: minute,
        max: 120,
        message: 'Muitas requisições administrativas. Aguarde um minuto.',
      },
      {
        name: 'public',
        match: req => /\/api\/(petshop\/public|demo)/.test(normPath(req)),
        windowMs: minute,
        max: 120,
        message: 'Muitas requisições. Aguarde um minuto.',
      },
    ]),
  );

  // Aumenta o limite de payload para suportar importações grandes (ex.: inventário com 1500+ itens)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors({ origin: buildCorsOrigins(), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

  // Fecha conexões de banco de forma limpa em deploy/restart (SIGTERM)
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3530;
  await app.listen(port, '0.0.0.0');
  logger.log(`🐾 Pract Pet API rodando em: http://localhost:${port}/api`);
}
bootstrap();
