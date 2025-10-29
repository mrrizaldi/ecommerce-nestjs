import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async list(page = 1, limit = 20) {
    return this.ordersRepository.findAll(page, limit);
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    return this.ordersRepository.findByUserId(userId, page, limit);
  }

  async detail(id: string) {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
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
}
