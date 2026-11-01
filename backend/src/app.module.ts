import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { TenantsModule } from './tenants/tenants.module';
import { SalesModule } from './sales/sales.module';
import { CashRegistersModule } from './cash-registers/cash-registers.module';
import { UsersModule } from './users/users.module';
import { TributacaoModule } from './tributacao/tributacao.module';
import { NfceModule } from './nfce/nfce.module';
import { OperatorsModule } from './operators/operators.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { MasterProductsModule } from './master-products/master-products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { PayablesModule } from './payables/payables.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { GroupsModule } from './groups/groups.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { ComandasModule } from './comandas/comandas.module';
import { VitrineModule } from './vitrine/vitrine.module';

import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantInterceptor } from './prisma/tenant-context.service';
import { ScheduleModule } from '@nestjs/schedule';
import { IntegrationsModule } from './integrations/integrations.module';
import { BackupsModule } from './backups/backups.module';
import { DemoModule } from './demo/demo.module';
import { ImageMaintenanceModule } from './maintenance/image-maintenance.module';
import { PetshopModule } from './petshop/petshop.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProductsModule,
    ImageMaintenanceModule,
    CategoriesModule,
    CustomersModule,
    TenantsModule,
    SalesModule,
    CashRegistersModule,
    UsersModule,
    TributacaoModule,
    NfceModule,
    OperatorsModule,
    DashboardModule,
    ReportsModule,
    MasterProductsModule,
    SuppliersModule,
    PurchaseOrdersModule,
    PayablesModule,
    PaymentMethodsModule,
    IntegrationsModule,
    BackupsModule,
    GroupsModule,
    FiscalModule,
    ComandasModule,
    VitrineModule,
    PetshopModule,
    // Demo — só carrega quando APP_MODE=demo (servidor Smartek)
    ...(process.env.APP_MODE === 'demo' ? [DemoModule] : []),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
