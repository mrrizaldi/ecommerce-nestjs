import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            inventoryStock: true,
          },
        },
        productCategories: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.product.findUnique({
      where: { slug },
      include: {
        variants: {
          include: {
            inventoryStock: true,
          },
        },
        productCategories: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async findAll(filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    categoryIds?: string[];
  }) {
    const { page = 1, limit = 20, search, status, categoryIds } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      AND: [
        search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
        status ? { status } : {},
        categoryIds?.length
          ? {
              productCategories: {
                some: {
                  categoryId: { in: categoryIds },
                },
              },
            }
          : {},
      ],
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          variants: {
            include: {
              inventoryStock: true,
            },
          },
          productCategories: {
            include: {
              category: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({
      data,
      include: {
        variants: {
          include: {
            inventoryStock: true,
          },
        },
        productCategories: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
      include: {
        variants: {
          include: {
            inventoryStock: true,
          },
        },
        productCategories: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.product.delete({
      where: { id },
    });
  }

  async createVariant(data: Prisma.ProductVariantCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data,
      });

      await tx.inventoryStock.create({
        data: {
          variantId: variant.id,
          quantity: 0,
        },
      });

      return variant;
    });
  }

  async updateVariantStock(variantId: string, quantity: number) {
    return this.prisma.inventoryStock.update({
      where: { variantId },
      data: { quantity },
    });
  }

  async getVariantStock(variantId: string) {
    return this.prisma.inventoryStock.findUnique({
      where: { variantId },
    });
  }
}
