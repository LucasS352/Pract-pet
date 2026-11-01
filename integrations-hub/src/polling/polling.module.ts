import { Module } from '@nestjs/common';
import { PollingService } from './polling.service';

import { PrismaModule } from '../prisma/prisma.module';
import { IfoodModule } from '../ifood/ifood.module';

@Module({
  imports: [PrismaModule, IfoodModule],
  providers: [PollingService]
})
export class PollingModule {}
