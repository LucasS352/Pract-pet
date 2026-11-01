import { Module } from '@nestjs/common';
import { NfceService } from './nfce.service';
import { NfceController } from './nfce.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [NfceController],
  providers: [NfceService],
  exports: [NfceService],
})
export class NfceModule {}
