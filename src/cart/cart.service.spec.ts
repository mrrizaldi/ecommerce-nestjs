import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';

const createCacheMock = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

const createConfigMock = () => ({
  get: jest.fn().mockReturnValue(60),
});

const createPrismaMock = () => {
  const mock: any = {
    productVariant: {
      findUnique: jest.fn(),
    },
    cart: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
    inventoryStock: {
      update: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(mock)),
  };
  return mock;
};

describe('CartService', () => {
  let service: CartService;
  let cache: ReturnType<typeof createCacheMock>;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    cache = createCacheMock();
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: ConfigService, useValue: createConfigMock() },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CartService);
    jest.clearAllMocks();
  });

  describe('getCart', () => {
    it('returns cached cart when available', async () => {
      cache.get.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
        currency: 'IDR',
        items: [
          {
            id: 'item-1',
            variantId: 'variant-1',
            productId: 'prod-1',
            productTitle: 'Keyboard',
            currency: 'IDR',
            price: 150000,
            quantity: 1,
            subtotal: 150000,
          },
        ],
        totalQuantity: 1,
        subtotalAmount: 150000,
      });

      const result = await service.getCart('user-1');

      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
      expect(result.totalQuantity).toBe(1);
    });

    it('loads from database and caches when missing', async () => {
      cache.get.mockResolvedValueOnce(undefined);
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
        currency: 'IDR',
        items: [
          {
            id: 'item-1',
            variantId: 'variant-1',
            quantity: 2,
            variant: {
              price: 150000,
              currency: 'IDR',
              product: { title: 'Keyboard' },
              inventoryStock: { quantity: 5 },
            },
          },
        ],
      });

      const result = await service.getCart('user-1');

      expect(cache.set).toHaveBeenCalled();
      expect(result.subtotalAmount).toBe(300000);
    });
  });

  describe('addItem', () => {
    const variantRecord = {
      id: 'variant-1',
      currency: 'IDR',
      price: 150000,
      sku: 'SKU-1',
      title: 'Variant',
      inventoryStock: { quantity: 10 },
      product: { title: 'Keyboard' },
    };

    beforeEach(() => {
      prisma.productVariant.findUnique.mockResolvedValue(variantRecord);
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
        currency: 'IDR',
        items: [],
      });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
        currency: 'IDR',
        items: [
          {
            id: 'item-1',
            variantId: 'variant-1',
            quantity: 2,
            variant: variantRecord,
          },
        ],
      });
    });

    it('returns cached response when idempotency key matches previous request', async () => {
      const payload = { userId: 'user-1', variantId: 'variant-1', quantity: 1 };
      const requestHash = (service as any).computeRequestHash(payload);
      prisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'idem-1',
        scope: 'cart:add-item:user-1',
        requestHash,
        response: {
          id: 'cart-1',
          userId: 'user-1',
          items: [],
          totalQuantity: 0,
          subtotalAmount: 0,
        },
      });

      const result = await service.addItem('user-1', { variantId: 'variant-1', quantity: 1 }, 'idem-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.totalQuantity).toBe(0);
    });

    it('throws ConflictException when idempotency payload differs', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'idem-1',
        scope: 'cart:add-item:user-1',
        requestHash: 'hash-A',
      });

      await expect(
        service.addItem(
          'user-1',
          { variantId: 'variant-1', quantity: 2 },
          'idem-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('adds item to new cart and stores idempotency response', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue(null);
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.upsert.mockResolvedValue({});
      prisma.idempotencyKey.upsert.mockResolvedValue({});
      prisma.cart.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'cart-1', userId: 'user-1', currency: 'IDR' });

      const result = await service.addItem('user-1', {
        variantId: 'variant-1',
        quantity: 2,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.cart.create).toHaveBeenCalled();
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cartId_variantId: {
              cartId: 'cart-1',
              variantId: 'variant-1',
            },
          },
        }),
      );
      expect(prisma.idempotencyKey.upsert).not.toHaveBeenCalled();
      expect(result.totalQuantity).toBe(2);
    });

    it('throws BadRequest when stock insufficient', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue(null);
      prisma.productVariant.findUnique.mockResolvedValue({
        ...variantRecord,
        inventoryStock: { quantity: 1 },
      });

      await expect(
        service.addItem('user-1', { variantId: 'variant-1', quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeItem', () => {
    it('throws when active cart not found', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await expect(service.removeItem('user-1', 'item-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes item and refreshes cache', async () => {
      prisma.cart.findFirst.mockResolvedValueOnce({ id: 'cart-1' });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
        currency: 'IDR',
        items: [],
      });

      const result = await service.removeItem('user-1', 'item-1');

      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { id: 'item-1', cartId: 'cart-1' },
      });
      expect(cache.set).toHaveBeenCalled();
      expect(result.items).toHaveLength(0);
    });
  });
});
