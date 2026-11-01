import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { StationAccessService } from './station-access.service';

/** Interface do payload decodificado do JWT — usado em todos os controllers */
export interface JwtPayload {
  sub: string;        // userId
  email: string;
  tenantId: string;
  role: string;
  groupId?: string | null;
  type?: string;
  linkId?: string;
  station?: string;
}

/**
 * Secret do JWT: obrigatoriamente definido via env JWT_SECRET.
 * Se não estiver definido, a aplicação falha na inicialização.
 */
export const jwtConstants = {
  secret: process.env.JWT_SECRET as string,
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly access: StationAccessService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  /**
   * Retorna o objeto que fica em `req.user` nas rotas protegidas.
   * IMPORTANTE: `sub` é o userId — todos os controllers devem usar `user.sub`.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.type === 'station-session') {
      if (!payload.linkId || !payload.tenantId) throw new UnauthorizedException();
      const link = await this.access.validateLink(payload.linkId, payload.tenantId);
      return { ...payload, role: 'station', station: link.station };
    }
    // RFC 8725: rejeitar tokens com finalidade diferente da sessão da loja
    if (payload.type) {
      throw new UnauthorizedException('Token inválido para autenticação da loja');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
      groupId: payload.groupId ?? null,
    };
  }
}
