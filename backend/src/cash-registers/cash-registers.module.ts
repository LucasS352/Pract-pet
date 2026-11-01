import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CashRegistersService } from './cash-registers.service';
import { CashRegistersController } from './cash-registers.controller';
import { jwtConstants } from '../auth/jwt.strategy';

@Module({
  imports: [
    JwtModule.register({
      secret: jwtConstants.secret,
    }),
  ],
  providers: [CashRegistersService],
  controllers: [CashRegistersController],
  exports: [CashRegistersService],
})
export class CashRegistersModule {}
