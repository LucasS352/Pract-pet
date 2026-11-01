import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StationAccessService } from './station-access.service';

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
  providers: [StationAccessService],
  exports: [StationAccessService],
})
export class StationAccessModule {}
