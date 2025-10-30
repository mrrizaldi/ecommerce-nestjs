import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsSortOption } from './dto/get-products-query.dto';

type ProductListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductsSortOption;
};

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

  async findAll(filters: ProductListFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      categoryIds,
      minPrice,
      maxPrice,
      sort = ProductsSortOption.NEWEST,
    } = filters;
    const skip = (page - 1) * limit;

    const andFilters: Prisma.ProductWhereInput[] = [];

    if (search) {
      andFilters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (status) {
      andFilters.push({ status });
    }

    if (categoryIds?.length) {
      andFilters.push({
        productCategories: {
          some: {
            categoryId: { in: categoryIds },
          },
        },
      });
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      andFilters.push({
        variants: {
          some: {
            price: {
              ...(minPrice !== undefined
                ? { gte: new Prisma.Decimal(minPrice) }
                : {}),
              ...(maxPrice !== undefined
                ? { lte: new Prisma.Decimal(maxPrice) }
                : {}),
            },
          },
        },
      });
    }

    const where: Prisma.ProductWhereInput =
      andFilters.length > 0 ? { AND: andFilters } : {};

    const orderBy = (() => {
      switch (sort) {
        case ProductsSortOption.OLDEST:
          return { createdAt: Prisma.SortOrder.asc };
        case ProductsSortOption.PRICE_ASC:
          return { variants: { _min: { price: Prisma.SortOrder.asc } } };
        case ProductsSortOption.PRICE_DESC:
          return { variants: { _max: { price: Prisma.SortOrder.desc } } };
        case ProductsSortOption.NEWEST:
        default:
          return { createdAt: Prisma.SortOrder.desc };
      }
    })() as Prisma.ProductOrderByWithRelationInput;

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
        orderBy,
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
