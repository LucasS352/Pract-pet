import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StationAccessService } from './station-access.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly access: StationAccessService) { super(); }
  async canActivate(context: ExecutionContext) {
    const allowed = await super.canActivate(context);
    if (allowed) await this.access.authorizeRequest(context.switchToHttp().getRequest());
    return Boolean(allowed);
  }
}
