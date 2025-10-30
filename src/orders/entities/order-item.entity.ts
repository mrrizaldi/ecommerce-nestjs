import { ApiProperty } from '@nestjs/swagger';

export class OrderItemEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  variantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  productTitle?: string | null;

  @ApiProperty()
  variantTitle?: string | null;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  total!: number;

  constructor(partial: Partial<OrderItemEntity>) {
    Object.assign(this, partial);
  }
}
