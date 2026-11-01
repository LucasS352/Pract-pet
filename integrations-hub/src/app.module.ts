import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IfoodModule } from './ifood/ifood.module';
import { PollingModule } from './polling/polling.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule, 
    IfoodModule, 
    PollingModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
