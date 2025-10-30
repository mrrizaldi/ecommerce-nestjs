import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductVariantsRepository } from './product-variants.repository';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly productVariantsRepository: ProductVariantsRepository,
  ) {}

  async findById(id: string) {
    return this.productVariantsRepository.findById(id);
  }

  async findBySku(sku: string) {
    return this.productVariantsRepository.findBySku(sku);
  }

  async findByProductId(productId: string) {
    return this.productVariantsRepository.findByProductId(productId);
  }

  async create(data: Prisma.ProductVariantCreateInput) {
    return this.productVariantsRepository.create(data);
  }

  async update(id: string, data: Prisma.ProductVariantUpdateInput) {
    return this.productVariantsRepository.update(id, data);
  }

  async delete(id: string) {
    return this.productVariantsRepository.delete(id);
  }

  async updateStock(variantId: string, quantity: number) {
    return this.productVariantsRepository.updateStock(variantId, quantity);
  }

  async getStock(variantId: string) {
    return this.productVariantsRepository.getStock(variantId);
  }
}