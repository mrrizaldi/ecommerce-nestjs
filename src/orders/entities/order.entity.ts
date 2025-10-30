import { ApiProperty } from '@nestjs/swagger';
import { OrderItemEntity } from './order-item.entity';

export class OrderEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  subtotalAmount!: number;

  @ApiProperty()
  shippingAmount!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty({ type: () => [OrderItemEntity] })
  items!: OrderItemEntity[];

  @ApiProperty({ description: 'ISO timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'ISO timestamp' })
  updatedAt!: Date;

  constructor(partial: Partial<OrderEntity>) {
    Object.assign(this, partial);
  }
}
