import { ApiProperty } from '@nestjs/swagger';

export class CartItemEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  variantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productTitle!: string;

  @ApiProperty()
  variantTitle?: string | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ description: 'Unit price in the smallest currency unit' })
  price!: number;

  @ApiProperty({ description: 'Quantity of this variant in the cart' })
  quantity!: number;

  @ApiProperty({ description: 'Subtotal = price * quantity' })
  subtotal!: number;

  @ApiProperty({ description: 'Available stock for the variant', nullable: true })
  availableStock?: number | null;

  constructor(partial: Partial<CartItemEntity>) {
    Object.assign(this, partial);
  }
}
