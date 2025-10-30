import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { AdminProductsController } from './admin-products.controller';
import { ProductVariantsService } from './product-variants.service';
import { ProductVariantsRepository } from './product-variants.repository';

@Module({
  controllers: [ProductsController, AdminProductsController],
  providers: [
    ProductsService,
    ProductsRepository,
    ProductVariantsService,
    ProductVariantsRepository,
    RolesGuard
  ],
  exports: [ProductsService, ProductVariantsService],
})
export class ProductsModule {}
