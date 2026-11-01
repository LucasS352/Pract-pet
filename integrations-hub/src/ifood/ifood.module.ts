import { Module } from '@nestjs/common';
import { IfoodService } from './ifood.service';

@Module({
  providers: [IfoodService],
  exports: [IfoodService],
})
export class IfoodModule {}
