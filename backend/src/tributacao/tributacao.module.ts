import { Module } from '@nestjs/common';
import { TributacaoController } from './tributacao.controller';
import { TributacaoService } from './tributacao.service';

@Module({
  controllers: [TributacaoController],
  providers: [TributacaoService],
  exports: [TributacaoService],
})
export class TributacaoModule {}
