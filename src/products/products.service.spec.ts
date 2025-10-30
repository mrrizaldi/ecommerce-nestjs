import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { ProductsSortOption } from './dto/get-products-query.dto';

const createCacheMock = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

const createConfigMock = () => ({
  get: jest.fn().mockReturnValue(60),
});

const createRepositoryMock = () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: ReturnType<typeof createRepositoryMock>;
  let cache: ReturnType<typeof createCacheMock>;

  const productRecord = {
    id: 'prod-1',
    title: 'Keyboard',
    description: 'Mechanical keyboard',
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [
      {
        id: 'variant-1',
        price: 150000,
        currency: 'IDR',
        inventoryStock: { quantity: 5 },
      },
    ],
  } as any;

  beforeEach(async () => {
    repository = createRepositoryMock();
    cache = createCacheMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: repository },
        { provide: ConfigService, useValue: createConfigMock() },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get(ProductsService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns cached list when available', async () => {
      cache.get.mockResolvedValue({
        data: [{ id: 'prod-1', name: 'Keyboard', price: 150000, stock: 5 }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const result = await service.list({} as any);

      expect(repository.findAll).not.toHaveBeenCalled();
      expect(result.meta.total).toBe(1);
      expect(result.data[0]).toMatchObject({ id: 'prod-1', price: 150000 });
    });

    it('fetches from repository when cache miss', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findAll.mockResolvedValue({
        data: [productRecord],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const result = await service.list({ sort: ProductsSortOption.NEWEST } as any);

      expect(repository.findAll).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
      expect(result.data[0]).toMatchObject({ name: 'Keyboard', stock: 5 });
    });

    it('throws BadRequest when maxPrice < minPrice', async () => {
      await expect(
        service.list({ minPrice: 100, maxPrice: 50 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('detail', () => {
    it('returns cached entity if exists', async () => {
      cache.get.mockResolvedValue({ id: 'prod-1', name: 'Cached' });

      const result = await service.detail('prod-1');

      expect(repository.findById).not.toHaveBeenCalled();
      expect(result).toMatchObject({ name: 'Cached' });
    });

    it('throws when product missing', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findById.mockResolvedValue(null);

      await expect(service.detail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates product and invalidates caches', async () => {
      cache.get.mockResolvedValueOnce(['products:list:cache-key']);
      repository.create.mockResolvedValue({
        ...productRecord,
        slug: 'keyboard',
      });

      await service.create({
        name: 'Keyboard',
        description: 'Mechanical keyboard',
        price: 150000,
        stock: 5,
      });

      expect(repository.create).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith('products:list:cache-key');
      expect(cache.del).toHaveBeenCalledWith('products:list:index');
    });
  });

  describe('update', () => {
    it('throws when product not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates product and refreshes cache', async () => {
      repository.findById.mockResolvedValue({ ...productRecord, slug: 'keyboard' });
      repository.update.mockResolvedValue({
        ...productRecord,
        slug: 'keyboard',
        title: 'Updated Keyboard',
      });

      const result = await service.update('prod-1', { name: 'Updated Keyboard' });

      expect(cache.del).toHaveBeenCalledWith('products:detail:slug:keyboard');
      expect(result.name).toBe('Updated Keyboard');
    });
  });

  describe('delete', () => {
    it('removes product and cleans cache', async () => {
      repository.findById.mockResolvedValue({ ...productRecord, slug: 'keyboard' });

      await service.delete('prod-1');

      expect(repository.delete).toHaveBeenCalledWith('prod-1');
      expect(cache.del).toHaveBeenCalledWith('products:detail:prod-1');
      expect(cache.del).toHaveBeenCalledWith('products:detail:slug:keyboard');
    });
  });
});
