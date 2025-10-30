import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductVariantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return null;
    }

    return this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        inventoryStock: true,
      },
    });
  }

  async findBySku(sku: string) {
    return this.prisma.productVariant.findUnique({
      where: { sku },
      include: {
        inventoryStock: true,
        product: {
          include: {
            productCategories: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });
  }

  async findByProductId(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: {
        inventoryStock: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async create(data: Prisma.ProductVariantCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data,
      });

      // Initialize inventory stock
      await tx.inventoryStock.create({
        data: {
          variantId: variant.id,
          quantity: 0,
        },
      });

      return variant;
    });
  }

  async update(id: string, data: Prisma.ProductVariantUpdateInput) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error('Invalid product variant ID format');
    }

    return this.prisma.productVariant.update({
      where: { id },
      data,
      include: {
        inventoryStock: true,
      },
    });
  }

  async delete(id: string) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error('Invalid product variant ID format');
    }

    return this.prisma.productVariant.delete({
      where: { id },
    });
  }

  async updateStock(variantId: string, quantity: number) {
    return this.prisma.inventoryStock.update({
      where: { variantId },
      data: { quantity },
    });
  }

  async getStock(variantId: string) {
    const stock = await this.prisma.inventoryStock.findUnique({
      where: { variantId },
    });

    return stock?.quantity ?? 0;
  }
}