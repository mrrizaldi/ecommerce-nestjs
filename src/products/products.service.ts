import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async list(page: number, limit: number) {
    const result = await this.productsRepository.findAll({ page, limit });
    return {
      ...result,
      data: result.data.map((product) => this.toProductEntity(product)),
    };
  }

  async detail(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.toProductEntity(product);
  }

  async findBySlug(slug: string) {
    const product = await this.productsRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    return this.toProductEntity(product);
  }

  async create(dto: CreateProductDto) {
    const slug = this.slugify(dto.name);
    const sku = `${slug}-${Date.now()}`;

    const product = await this.productsRepository.create({
      title: dto.name,
      slug,
      description: dto.description,
      status: 'ACTIVE',
      variants: {
        create: [
          {
            sku,
            title: dto.name,
            price: new Prisma.Decimal(dto.price),
            currency: 'IDR',
            inventoryStock: {
              create: {
                quantity: dto.stock,
              },
            },
          },
        ],
      },
    });

    return this.toProductEntity(product);
  }

  async update(id: string, data: Prisma.ProductUpdateInput) {
    await this.detail(id);
    const product = await this.productsRepository.update(id, data);
    return this.toProductEntity(product);
  }

  async delete(id: string) {
    await this.detail(id);
    return this.productsRepository.delete(id);
  }

  async createVariant(data: Prisma.ProductVariantCreateInput) {
    return this.productsRepository.createVariant(data);
  }

  async updateVariantStock(variantId: string, quantity: number) {
    return this.productsRepository.updateVariantStock(variantId, quantity);
  }

  async getVariantStock(variantId: string) {
    return this.productsRepository.getVariantStock(variantId);
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private toProductEntity(
    product: Awaited<ReturnType<ProductsRepository['findById']>>,
  ) {
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const primaryVariant = product.variants?.[0];
    const price = primaryVariant?.price
      ? Number(primaryVariant.price)
      : 0;
    const stock = primaryVariant?.inventoryStock?.quantity ?? 0;

    return new ProductEntity({
      id: product.id,
      name: product.title,
      description: product.description ?? undefined,
      price,
      stock,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    });
  }
}
