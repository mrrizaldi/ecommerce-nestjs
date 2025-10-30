import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartEntity } from './entities/cart.entity';
import { CartItemEntity } from './entities/cart-item.entity';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;
type CartWithItems = any;

@Injectable()
export class CartService {
  private readonly cacheTtlMs: number;

  private readonly cartInclude: Prisma.CartInclude = {
    items: {
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
              },
            },
            inventoryStock: true,
          },
        },
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const ttlSeconds = this.configService.get<number>('CACHE_TTL_SECONDS', 60);
    this.cacheTtlMs = Math.max(ttlSeconds, 1) * 1000;
  }

  async getCart(userId: string): Promise<CartEntity> {
    const cacheKey = this.buildCacheKey(userId);
    const cached = await this.cacheManager.get<unknown>(cacheKey);
    if (cached) {
      return this.deserializeCart(cached, userId);
    }

    const cartRecord = await this.findActiveCart(userId, this.prisma);
    const cartEntity = this.toCartEntity(cartRecord, userId);

    await this.cacheManager.set(
      cacheKey,
      this.serializeCart(cartEntity),
      this.cacheTtlMs,
    );

    return cartEntity;
  }

  async addItem(
    userId: string,
    dto: AddCartItemDto,
    idempotencyKey?: string,
  ): Promise<CartEntity> {
    const scope = `cart:add-item:${userId}`;
    const requestHash = this.computeRequestHash({ userId, ...dto });
    const cacheKey = this.buildCacheKey(userId);

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing) {
        if (existing.scope !== scope) {
          throw new ConflictException('Idempotency key scope mismatch');
        }
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key already used with different payload',
          );
        }
        if (existing.response) {
          const restored = this.deserializeCart(existing.response, userId);
          await this.cacheManager.set(
            cacheKey,
            existing.response,
            this.cacheTtlMs,
          );
          return restored;
        }
      }
    }

    const cartRecord = (await this.prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findUnique({
          where: { id: dto.variantId },
          include: {
            inventoryStock: true,
            product: {
              select: { id: true, title: true },
            },
          },
        });

        if (!variant) {
          throw new NotFoundException('Product variant not found');
        }

        const availableStock = variant.inventoryStock?.quantity ?? 0;
        if (availableStock <= 0) {
          throw new BadRequestException('Variant is out of stock');
        }

        let cart = await this.findActiveCart(userId, tx);

        if (!cart) {
          cart = (await tx.cart.create({
            data: {
              userId,
              currency: variant.currency,
            },
            include: this.cartInclude,
          })) as CartWithItems;
        } else if (cart.currency && cart.currency !== variant.currency) {
          throw new BadRequestException(
            'Cart currency does not match variant currency',
          );
        } else if (!cart.currency && variant.currency) {
          await tx.cart.update({
            where: { id: cart.id },
            data: { currency: variant.currency },
          });
        }

        const activeCart =
          cart ??
          (await this.findActiveCart(userId, tx)); // reload if cart was created above

        if (!activeCart) {
          throw new NotFoundException('Failed to initialise cart');
        }

        const existingItem = await tx.cartItem.findUnique({
          where: {
            cartId_variantId: {
              cartId: activeCart.id,
              variantId: dto.variantId,
            },
          },
        });

        const newQuantity = (existingItem?.quantity ?? 0) + dto.quantity;
        if (newQuantity > availableStock) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${availableStock}`,
          );
        }

        await tx.cartItem.upsert({
          where: {
            cartId_variantId: {
              cartId: activeCart.id,
              variantId: dto.variantId,
            },
          },
          create: {
            cartId: activeCart.id,
            variantId: dto.variantId,
            quantity: dto.quantity,
          },
          update: {
            quantity: newQuantity,
          },
        });

        const updatedCart = await tx.cart.findUnique({
          where: { id: activeCart.id },
          include: this.cartInclude,
        });

        if (!updatedCart) {
          throw new NotFoundException('Cart not found after update');
        }

        return updatedCart as CartWithItems;
      })) as CartWithItems;

    const cartEntity = this.toCartEntity(cartRecord, userId);
    const serializedCart = this.serializeCart(cartEntity);

    await this.cacheManager.set(cacheKey, serializedCart, this.cacheTtlMs);

    if (idempotencyKey) {
      await this.prisma.idempotencyKey.upsert({
        where: { key: idempotencyKey },
        update: {
          response: serializedCart,
        },
        create: {
          key: idempotencyKey,
          scope,
          requestHash,
          response: serializedCart,
        },
      });
    }

    return cartEntity;
  }

  async removeItem(userId: string, itemId: string): Promise<CartEntity> {
    const cacheKey = this.buildCacheKey(userId);
    const cart = await this.prisma.cart.findFirst({
      where: { userId, isCheckedOut: false },
    });

    if (!cart) {
      throw new NotFoundException('Active cart not found');
    }

    const deleteResult = await this.prisma.cartItem.deleteMany({
      where: {
        id: itemId,
        cartId: cart.id,
      },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundException('Cart item not found');
    }

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: this.cartInclude,
    });

    const cartEntity = this.toCartEntity(updatedCart, userId);
    await this.cacheManager.set(
      cacheKey,
      this.serializeCart(cartEntity),
      this.cacheTtlMs,
    );

    return cartEntity;
  }

  private buildCacheKey(userId: string) {
    return `cart:user:${userId}`;
  }

  private async findActiveCart(
    userId: string,
    executor: PrismaExecutor,
  ): Promise<CartWithItems | null> {
    return executor.cart.findFirst({
      where: { userId, isCheckedOut: false },
      include: this.cartInclude,
    }) as Promise<CartWithItems | null>;
  }

  private toCartEntity(
    cart: CartWithItems | null,
    userId: string,
  ): CartEntity {
    if (!cart) {
      return this.emptyCart(userId);
    }

    const items =
      cart.items?.map((item: any) => {
        const price = Number(item.variant.price);
        const subtotal = price * item.quantity;
        return new CartItemEntity({
          id: item.id,
          variantId: item.variantId,
          productId: item.variant.productId,
          productTitle: item.variant.product?.title ?? '',
          variantTitle: item.variant.title,
          currency: item.variant.currency,
          price,
          quantity: item.quantity,
          subtotal,
          availableStock: item.variant.inventoryStock?.quantity ?? null,
        });
      }) ?? [];

    const totalQuantity = items.reduce(
      (sum: number, current: CartItemEntity) => sum + current.quantity,
      0,
    );
    const subtotalAmount = items.reduce(
      (sum: number, current: CartItemEntity) => sum + current.subtotal,
      0,
    );

    return new CartEntity({
      id: cart.id,
      userId: cart.userId,
      currency: cart.currency ?? items[0]?.currency ?? null,
      items,
      totalQuantity,
      subtotalAmount,
    });
  }

  private emptyCart(userId: string): CartEntity {
    return new CartEntity({
      id: null,
      userId,
      currency: null,
      items: [],
      totalQuantity: 0,
      subtotalAmount: 0,
    });
  }

  private serializeCart(cart: CartEntity) {
    return {
      id: cart.id ?? null,
      userId: cart.userId,
      currency: cart.currency ?? null,
      totalQuantity: cart.totalQuantity,
      subtotalAmount: cart.subtotalAmount,
      items: cart.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productId: item.productId,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle ?? null,
        currency: item.currency,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        availableStock: item.availableStock ?? null,
      })),
    };
  }

  private deserializeCart(payload: unknown, userId: string): CartEntity {
    if (!payload || typeof payload !== 'object') {
      return this.emptyCart(userId);
    }

    const plain = payload as Record<string, any>;
    const itemsArray: any[] = Array.isArray(plain.items) ? plain.items : [];

    const items = itemsArray.map(
      (item) =>
        new CartItemEntity({
          id: item.id,
          variantId: item.variantId,
          productId: item.productId,
          productTitle: item.productTitle,
          variantTitle: item.variantTitle ?? null,
          currency: item.currency,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          availableStock: item.availableStock ?? null,
        }),
    );

    return new CartEntity({
      id: plain.id ?? null,
      userId: plain.userId ?? userId,
      currency: plain.currency ?? null,
      items,
      totalQuantity: plain.totalQuantity ?? 0,
      subtotalAmount: plain.subtotalAmount ?? 0,
    });
  }

  private computeRequestHash(payload: unknown) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
