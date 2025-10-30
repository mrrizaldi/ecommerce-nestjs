import { ApiProperty } from '@nestjs/swagger';
import { CartItemEntity } from './cart-item.entity';

export class CartEntity {
  @ApiProperty({ nullable: true })
  id?: string | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  currency?: string | null;

  @ApiProperty({ type: () => [CartItemEntity] })
  items!: CartItemEntity[];

  @ApiProperty()
  totalQuantity!: number;

  @ApiProperty({
    description: 'Subtotal amount (sum of item subtotals) in the smallest currency unit',
  })
  subtotalAmount!: number;

  constructor(partial: Partial<CartEntity>) {
    this.items = partial.items ?? [];
    this.totalQuantity = partial.totalQuantity ?? 0;
    this.subtotalAmount = partial.subtotalAmount ?? 0;
    Object.assign(this, partial);
  }
}
