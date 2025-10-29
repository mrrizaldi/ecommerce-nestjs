import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductEntity } from './entities/product.entity';

@Injectable()
export class ProductsService {
  list(page: number, limit: number) {
    return {
      data: [],
      meta: { page, limit, total: 0 },
    };
  }

  detail(id: string) {
    return new ProductEntity({
      id,
      name: 'Sample',
      price: 10000,
      stock: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  create(dto: CreateProductDto) {
    return { created: true, dto };
  }
}
