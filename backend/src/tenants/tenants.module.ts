import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { jwtConstants } from '../auth/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: jwtConstants.secret,
    }),
  ],
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService],
})
export class TenantsModule {}
