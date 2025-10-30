import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { CreateProductDto } from './dto/create-product.dto';
import {
  GetProductsQueryDto,
  ProductsSortOption,
} from './dto/get-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

type ProductListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type NormalizedListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort: ProductsSortOption;
};

@Injectable()
export class ProductsService {
  private readonly cacheTtlSeconds: number;
  private readonly listIndexKey = 'products:list:index';

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.cacheTtlSeconds = this.configService.get<number>(
      'CACHE_TTL_SECONDS',
      60,
    );
  }

  async list(query: GetProductsQueryDto) {
    const normalized = this.normalizeListQuery(query);

    if (
      normalized.maxPrice !== undefined &&
      normalized.minPrice !== undefined &&
      normalized.maxPrice < normalized.minPrice
    ) {
      throw new BadRequestException(
        'maxPrice cannot be lower than minPrice value',
      );
    }

    const cacheKey = this.buildListCacheKey(normalized);
    const cached = await this.cacheManager.get<{
      data: ProductEntity[];
      meta: ProductListMeta;
    }>(cacheKey);

    if (cached) {
      return {
        ...cached,
        data: cached.data.map(
          (product) =>
            product instanceof ProductEntity
              ? product
              : new ProductEntity(product),
        ),
      };
    }

    const result = await this.productsRepository.findAll(normalized);
    const transformed = {
      ...result,
      data: result.data.map((product) => this.toProductEntity(product)),
    };

    await this.cacheManager.set(cacheKey, transformed, this.cacheTtlSeconds);
    await this.trackListCacheKey(cacheKey);

    return transformed;
  }

  async detail(id: string) {
    const cacheKey = this.buildDetailCacheKey(id);
    const cached = await this.cacheManager.get<ProductEntity>(cacheKey);
    if (cached) {
      return cached instanceof ProductEntity
        ? cached
        : new ProductEntity(cached);
    }

    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const entity = this.toProductEntity(product);
    await this.cacheManager.set(cacheKey, entity, this.cacheTtlSeconds);
    return entity;
  }

  async findBySlug(slug: string) {
    const cacheKey = this.buildDetailCacheKey(`slug:${slug}`);
    const cached = await this.cacheManager.get<ProductEntity>(cacheKey);
    if (cached) {
      return cached instanceof ProductEntity
        ? cached
        : new ProductEntity(cached);
    }

    const product = await this.productsRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    const entity = this.toProductEntity(product);
    await this.cacheManager.set(cacheKey, entity, this.cacheTtlSeconds);
    return entity;
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

    const entity = this.toProductEntity(product);
    await this.invalidateListCaches();
    await this.cacheManager.set(
      this.buildDetailCacheKey(product.id),
      entity,
      this.cacheTtlSeconds,
    );
    await this.cacheManager.set(
      this.buildDetailCacheKey(`slug:${product.slug}`),
      entity,
      this.cacheTtlSeconds,
    );

    return entity;
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const data: Prisma.ProductUpdateInput = {
      title: dto.name ?? undefined,
      description: dto.description ?? undefined,
      status: dto.status ?? undefined,
    };

    if (dto.name) {
      data.slug = this.slugify(dto.name);
    }

    const primaryVariant = existing.variants?.[0];
    if (
      primaryVariant &&
      (dto.price !== undefined ||
        dto.stock !== undefined ||
        dto.name !== undefined)
    ) {
      data.variants = {
        update: {
          where: { id: primaryVariant.id },
          data: {
            title: dto.name ?? undefined,
            price:
              dto.price !== undefined
                ? new Prisma.Decimal(dto.price)
                : undefined,
            inventoryStock:
              dto.stock !== undefined
                ? {
                    upsert: {
                      update: { quantity: dto.stock },
                      create: { quantity: dto.stock },
                    },
                  }
                : undefined,
          },
        },
      };
    }

    await this.cacheManager.del(
      this.buildDetailCacheKey(`slug:${existing.slug}`),
    );

    const product = await this.productsRepository.update(id, data);
    const entity = this.toProductEntity(product);

    await this.invalidateListCaches();
    await this.cacheManager.set(
      this.buildDetailCacheKey(id),
      entity,
      this.cacheTtlSeconds,
    );
    await this.cacheManager.set(
      this.buildDetailCacheKey(`slug:${product.slug}`),
      entity,
      this.cacheTtlSeconds,
    );

    return entity;
  }

  async delete(id: string) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.productsRepository.delete(id);
    await this.invalidateListCaches();
    await this.cacheManager.del(this.buildDetailCacheKey(id));
    await this.cacheManager.del(
      this.buildDetailCacheKey(`slug:${existing.slug}`),
    );
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
    if (!value) {
      return '';
    }
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private normalizeListQuery(query: GetProductsQueryDto): NormalizedListQuery {
    return {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      status: query.status,
      categoryIds: query.categoryIds,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort ?? ProductsSortOption.NEWEST,
    };
  }

  private buildListCacheKey(query: NormalizedListQuery) {
    const hash = createHash('sha1')
      .update(JSON.stringify(query))
      .digest('hex');
    return `products:list:${hash}`;
  }

  private buildDetailCacheKey(id: string) {
    return `products:detail:${id}`;
  }

  private async trackListCacheKey(key: string) {
    const existing =
      (await this.cacheManager.get<string[]>(this.listIndexKey)) ?? [];
    if (!existing.includes(key)) {
      existing.push(key);
      await this.cacheManager.set(
        this.listIndexKey,
        existing,
        this.cacheTtlSeconds,
      );
    }
  }

  private async invalidateListCaches() {
    const keys =
      (await this.cacheManager.get<string[]>(this.listIndexKey)) ?? [];
    if (keys.length > 0) {
      await Promise.all(keys.map((key: string) => this.cacheManager.del(key)));
      await this.cacheManager.del(this.listIndexKey);
    }
  }

  private toProductEntity(
    product: Awaited<ReturnType<ProductsRepository['findById']>>,
  ) {
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const primaryVariant = product.variants?.[0];
    const price = primaryVariant?.price ? Number(primaryVariant.price) : 0;
    const stock = primaryVariant?.inventoryStock?.quantity ?? 0;

    const variants = product.variants?.map(variant => ({
      id: variant.id,
      sku: variant.sku,
      title: variant.title ?? '',
      price: Number(variant.price),
      currency: variant.currency,
      weightGrams: variant.weightGrams ?? undefined,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    })) ?? [];

    return new ProductEntity({
      id: product.id,
      name: product.title,
      description: product.description ?? undefined,
      price,
      stock,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      variants,
    });
  }
}
