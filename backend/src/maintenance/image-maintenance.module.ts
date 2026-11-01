import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ImageMaintenanceController, ImageMaintenanceGuard } from './image-maintenance.controller';
import { ImageMaintenanceService } from './image-maintenance.service';

@Module({ imports: [ProductsModule], controllers: [ImageMaintenanceController], providers: [ImageMaintenanceService, ImageMaintenanceGuard] })
export class ImageMaintenanceModule {}
