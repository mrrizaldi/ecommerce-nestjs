import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OrderInclude = Prisma.OrderInclude;

const defaultOrderInclude: OrderInclude = {
  items: {
    include: {
      variant: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
  billingAddress: true,
  shippingAddress: true,
  payments: true,
  shipments: true,
  inventoryMovements: true,
};

const toDecimal = (value: Prisma.Decimal | number | string) =>
  typeof value === 'string' || typeof value === 'number'
    ? new Prisma.Decimal(value)
    : value;

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, include: OrderInclude = defaultOrderInclude) {
    return this.prisma.order.findUnique({
      where: { id },
      include,
    });
  }

  async findByCode(code: string, include: OrderInclude = defaultOrderInclude) {
    return this.prisma.order.findUnique({
      where: { code },
      include,
    });
  }

  async findByUserId(
    userId: string,
    page = 1,
    limit = 20,
    include: OrderInclude = defaultOrderInclude,
  ) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      data: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAll(
    page = 1,
    limit = 20,
    filters: Prisma.OrderWhereInput = {},
    include: OrderInclude = defaultOrderInclude,
  ) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: filters,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.order.count({ where: filters }),
    ]);

    return {
      data: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createWithItems(params: {
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
    const { order, items, payments = [], shipments = [], decrementInventory } =
      params;

    return this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: order,
      });

      if (items.length) {
        await tx.orderItem.createMany({
          data: items.map((item) => ({
            orderId: createdOrder.id,
            variantId: item.variantId,
            sku: item.sku,
            productTitle: item.productTitle ?? null,
            variantTitle: item.variantTitle ?? null,
            price: toDecimal(item.price),
            quantity: item.quantity,
            total: toDecimal(item.total),
          })),
        });

        await Promise.all(
          items.map((item) =>
            this.createInventoryMovement(tx, {
              orderId: createdOrder.id,
              variantId: item.variantId,
              quantity: item.quantity,
              reason: 'ORDER_PLACED',
              decrementInventory,
            }),
          ),
        );
      }

      if (payments.length) {
        await tx.payment.createMany({
          data: payments.map((payment) => ({
            ...payment,
            orderId: createdOrder.id,
          })),
        });
      }

      if (shipments.length) {
        await tx.shipment.createMany({
          data: shipments.map((shipment) => ({
            ...shipment,
            orderId: createdOrder.id,
          })),
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: createdOrder.id },
        include: defaultOrderInclude,
      });
    });
  }

  async update(id: string, data: Prisma.OrderUpdateInput) {
    return this.prisma.order.update({
      where: { id },
      data,
      include: defaultOrderInclude,
    });
  }

  async addPayment(
    orderId: string,
    data: Prisma.PaymentCreateManyOrderInput | Prisma.PaymentCreateManyOrderInput[],
  ) {
    const payload = Array.isArray(data) ? data : [data];
    await this.prisma.payment.createMany({
      data: payload.map((payment) => ({
        ...payment,
        orderId,
      })),
    });

    return this.findById(orderId);
  }

  async addShipment(
    orderId: string,
    data: Prisma.ShipmentCreateManyInput | Prisma.ShipmentCreateManyInput[],
  ) {
    const payload = Array.isArray(data) ? data : [data];
    await this.prisma.shipment.createMany({
      data: payload.map((shipment) => ({
        ...shipment,
        orderId,
      })),
    });

    return this.findById(orderId);
  }

  private async createInventoryMovement(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      variantId: string;
      quantity: number;
      reason: string;
      decrementInventory?: boolean;
    },
  ) {
    const { orderId, variantId, quantity, reason, decrementInventory } = params;

    await tx.inventoryMovement.create({
      data: {
        orderId,
        variantId,
        delta: -Math.abs(quantity),
        reason,
      },
    });

    if (decrementInventory) {
      await tx.inventoryStock.update({
        where: { variantId },
        data: {
          quantity: {
            decrement: quantity,
          },
        },
      });
    }
  }
}
