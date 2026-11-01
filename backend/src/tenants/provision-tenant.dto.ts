export class ProvisionTenantDto {
  pin: string;
  tenantName: string;
  dbName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  seedProducts?: boolean;
  mensalidadeValor?: number;
  mensalidadeVencimento?: string;
}
