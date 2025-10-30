import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { AdminProductsController } from './admin-products.controller';

@Module({
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, ProductsRepository, RolesGuard],
})
export class ProductsModule {}
