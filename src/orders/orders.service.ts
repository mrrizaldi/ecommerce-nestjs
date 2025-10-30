import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { OrdersRepository } from './orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(page = 1, limit = 20) {
    const result = await this.ordersRepository.findAll(page, limit);
    return {
      ...result,
      data: result.data.map((order) => this.toOrderEntity(order as any)),
    };
  }

  async listForUser(userId: string, page = 1, limit = 20) {
    const result = await this.ordersRepository.findByUserId(
      userId,
      page,
      limit,
    );
    return {
      ...result,
      data: result.data.map((order) => this.toOrderEntity(order as any)),
    };
  }

  async detail(id: string) {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return this.toOrderEntity(order as any);
  }

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderEntity> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: dto.cartId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                inventoryStock: true,
                product: { select: { title: true } },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.userId !== userId || cart.isCheckedOut) {
      throw new NotFoundException('Cart not available for checkout');
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order items payload is required');
    }

    const dtoItemsMap = new Map(dto.items.map((item) => [item.variantId, item]));

    if (dtoItemsMap.size !== dto.items.length) {
      throw new BadRequestException('Duplicate variant detected in payload');
    }

    if (dto.items.length !== cart.items.length) {
      throw new BadRequestException('Order items do not match cart contents');
    }

    if (cart.currency && cart.currency !== dto.currency) {
      throw new BadRequestException('Cart currency does not match request');
    }

    const variants = cart.items.map((item) => item.variant);
    variants.forEach((variant) => {
      const cartItem = cart.items.find((item) => item.variantId === variant.id);
      if (!cartItem) {
        throw new BadRequestException('Variant mismatch in cart');
      }

      const payloadItem = dtoItemsMap.get(variant.id);
      if (!payloadItem) {
        throw new BadRequestException(
          `Variant ${variant.id} missing from order payload`,
        );
      }
      if (payloadItem.quantity !== cartItem.quantity) {
        throw new BadRequestException(
          `Variant ${variant.id} quantity mismatch (cart ${cartItem.quantity}, payload ${payloadItem.quantity})`,
        );
      }

      const available = variant.inventoryStock?.quantity ?? 0;
      if (available < cartItem.quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${variant.id} (requested ${cartItem.quantity}, available ${available})`,
        );
      }
      if (variant.currency !== dto.currency) {
        throw new BadRequestException('Cart currency mismatch with order request');
      }
    });

    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.variant.price) * item.quantity,
      0,
    );

    if (subtotal !== dto.subtotalAmount) {
      throw new BadRequestException('Subtotal amount mismatch');
    }

    const shipping = dto.shippingAmount ?? 0;
    const discount = dto.discountAmount ?? 0;
    const computedTotal = subtotal + shipping - discount;
    if (computedTotal !== dto.totalAmount) {
      throw new BadRequestException('Total amount mismatch');
    }

    const generatedCode = `ORD-${nanoid(10).toUpperCase()}`;

    const orderId = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          code: generatedCode,
          status: 'PENDING_PAYMENT',
          currency: dto.currency,
          subtotalAmount: new Prisma.Decimal(dto.subtotalAmount),
          shippingAmount: new Prisma.Decimal(shipping),
          discountAmount: new Prisma.Decimal(discount),
          totalAmount: new Prisma.Decimal(dto.totalAmount),
          user: { connect: { id: userId } },
          cart: { connect: { id: cart.id } },
          billingAddress: dto.billingAddressId
            ? { connect: { id: dto.billingAddressId } }
            : undefined,
          shippingAddress: dto.shippingAddressId
            ? { connect: { id: dto.shippingAddressId } }
            : undefined,
        },
      });

      await tx.orderItem.createMany({
        data: cart.items.map((item) => ({
          orderId: createdOrder.id,
          variantId: item.variantId,
          sku: item.variant.sku,
          productTitle: item.variant.product?.title ?? '',
          variantTitle: item.variant.title,
          price: item.variant.price,
          quantity: item.quantity,
          total: new Prisma.Decimal(
            Number(item.variant.price) * item.quantity,
          ),
        })),
      });

      for (const cartItem of cart.items) {
        if (!cartItem.variant.inventoryStock) {
          throw new BadRequestException(
            `Inventory stock record missing for variant ${cartItem.variantId}`,
          );
        }

        await tx.inventoryMovement.create({
          data: {
            orderId: createdOrder.id,
            variantId: cartItem.variantId,
            delta: -Math.abs(cartItem.quantity),
            reason: 'ORDER_PLACED',
          },
        });

        await tx.inventoryStock.update({
          where: { variantId: cartItem.variantId },
          data: {
            quantity: {
              decrement: cartItem.quantity,
            },
          },
        });
      }

      if (dto.paymentMethod) {
        await tx.payment.create({
          data: {
            orderId: createdOrder.id,
            provider: dto.paymentMethod,
            status: 'PENDING',
            amount: new Prisma.Decimal(dto.totalAmount),
            currency: dto.currency,
          },
        });
      }

      await tx.cart.update({
        where: { id: cart.id },
        data: {
          isCheckedOut: true,
          currency: cart.currency ?? dto.currency,
          checkedOutOrder: { connect: { id: createdOrder.id } },
        },
      });

      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return createdOrder.id;
    });

    const persisted = await this.ordersRepository.findById(orderId);
    if (!persisted) {
      throw new NotFoundException('Order not found after creation');
    }

    return this.toOrderEntity(persisted as any);
  }

  async getOrderForUser(userId: string, orderId: string): Promise<OrderEntity> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    return this.toOrderEntity(order as any);
  }

  async create(params: {
    order: Prisma.OrderCreateInput;
    items: Array<{
      variantId: string;
      sku: string;
      productTitle?: string | null;
      variantTitle?: string | null;
      price: Prisma.Decimal | number | string;
      quantity: number;
      total: Prisma.Decimal | number | string;
    }>;
    payments?: Array<Prisma.PaymentCreateManyInput>;
    shipments?: Array<Prisma.ShipmentCreateManyInput>;
    decrementInventory?: boolean;
  }) {
    return this.ordersRepository.createWithItems(params);
  }

  async update(id: string, data: Prisma.OrderUpdateInput) {
    await this.detail(id);
    return this.ordersRepository.update(id, data);
  }

  private toOrderEntity(order: any): OrderEntity {
    return new OrderEntity({
      id: order.id,
      code: order.code,
      status: order.status,
      currency: order.currency,
      subtotalAmount: Number(order.subtotalAmount),
      shippingAmount: Number(order.shippingAmount),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),
      items: (order.items ?? []).map(
        (item: any) =>
          new OrderItemEntity({
            id: item.id,
            variantId: item.variantId,
            sku: item.sku,
            productTitle: item.productTitle ?? undefined,
            variantTitle: item.variantTitle ?? undefined,
            price: Number(item.price),
            quantity: item.quantity,
            total: Number(item.total),
          }),
      ),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  }
}
