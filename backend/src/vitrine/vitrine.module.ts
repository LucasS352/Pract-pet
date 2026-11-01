import { Module } from '@nestjs/common';
import { VitrineController } from './vitrine.controller';
import { VitrineService } from './vitrine.service';

@Module({
  controllers: [VitrineController],
  providers: [VitrineService],
})
export class VitrineModule {}
