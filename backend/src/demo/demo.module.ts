import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { DemoController } from './demo.controller';
import { LeadsController } from './leads.controller';
import { DemoService } from './demo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { jwtConstants } from '../auth/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: jwtConstants.secret || process.env.JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [DemoController, LeadsController],
  providers: [DemoService],
})
export class DemoModule {}
