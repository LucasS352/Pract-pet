import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { jwtConstants } from '../auth/jwt.strategy';

export interface VerifiedOperator {
  opId: string;
  opName: string;
  isManager: boolean;
}

export interface VerifiedPinAuth {
  authType: 'cashier_pin' | 'manager_pin';
  managerOpId?: string;
  managerName?: string;
}

/**
 * Valida o cabeçalho X-Operator-Token (identidade do executor).
 * Executa lookup ao vivo no banco para checar o status ativo e permissão isManager.
 */
export async function verifyOperatorToken(
  jwtService: JwtService,
  prisma: any,
  token: string | undefined,
  tenantId: string,
  user?: any
): Promise<VerifiedOperator> {
  // Administrador ou Superadmin da loja autenticado via Bearer JWT possui autoridade total de gerente sem exigir PIN de operador
  if (user && (user.role === 'admin' || user.role === 'superadmin')) {
    return {
      opId: user.sub,
      opName: user.email || 'Administrador',
      isManager: true,
    };
  }

  if (!token || typeof token !== 'string') {
    throw new UnauthorizedException({
      statusCode: 401,
      message: 'Token de operador ausente. Faça login com o PIN do operador.',
      errorSource: 'operator_token',
    });
  }

  let decoded: any;
  try {
    decoded = jwtService.verify(token, { secret: jwtConstants.secret });
  } catch (err: any) {
    throw new UnauthorizedException({
      statusCode: 401,
      message: 'Token de operador expirado ou inválido. Reautentique-se com seu PIN.',
      errorSource: 'operator_token',
    });
  }

  if (decoded.type !== 'op') {
    throw new ForbiddenException('Token fornecido não é um token de operador válido.');
  }

  if (decoded.tenantId !== tenantId) {
    throw new ForbiddenException('Token de operador não pertence a esta loja.');
  }

  const operator = await prisma.operator.findFirst({
    where: { id: decoded.opId, active: true },
  });

  if (!operator) {
    throw new ForbiddenException('Operador inativo ou não encontrado no banco de dados.');
  }

  return {
    opId: operator.id,
    opName: operator.name,
    isManager: Boolean(operator.isManager),
  };
}

/**
 * Valida o cabeçalho X-Pin-Auth-Token (autorização adicional por PIN).
 * Escopada obrigatoriamente ao registerId esperado.
 */
export async function verifyPinAuth(
  jwtService: JwtService,
  prisma: any,
  token: string | undefined,
  tenantId: string,
  expectedRegisterId: string
): Promise<VerifiedPinAuth> {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedException({
      statusCode: 401,
      message: 'Autorização por PIN ausente. Desbloqueie com o PIN do caixa.',
      errorSource: 'pin_auth',
    });
  }

  let decoded: any;
  try {
    decoded = jwtService.verify(token, { secret: jwtConstants.secret });
  } catch (err: any) {
    throw new UnauthorizedException({
      statusCode: 401,
      message: 'Autorização por PIN expirada ou inválida. Digite o PIN novamente.',
      errorSource: 'pin_auth',
    });
  }

  if (decoded.type !== 'pin_auth') {
    throw new ForbiddenException('Token fornecido não é uma autorização de PIN válida.');
  }

  if (decoded.tenantId !== tenantId) {
    throw new ForbiddenException('Autorização por PIN não pertence a esta loja.');
  }

  if (decoded.registerId !== expectedRegisterId) {
    throw new ForbiddenException('Autorização por PIN emitida para um caixa diferente.');
  }

  if (decoded.authType === 'manager_pin' && decoded.managerOpId) {
    const manager = await prisma.operator.findFirst({
      where: { id: decoded.managerOpId, active: true, isManager: true },
    });
    if (!manager) {
      throw new ForbiddenException('Gerente autorizador inativo ou sem permissão.');
    }
  }

  return {
    authType: decoded.authType,
    managerOpId: decoded.managerOpId,
    managerName: decoded.managerName,
  };
}
