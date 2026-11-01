import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  // Aumenta o limite de payload para suportar importações grandes (ex.: inventário com 1500+ itens)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors();
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3530;
  await app.listen(port, '0.0.0.0');
  logger.log(`🐾 Pract Pet API rodando em: http://localhost:${port}/api`);
}
bootstrap();
