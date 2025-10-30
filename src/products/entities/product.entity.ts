import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ProductVariantEntity } from './product-variant.entity';

export class ProductEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  stock!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: () => [ProductVariantEntity], required: false })
  variants?: ProductVariantEntity[];

  @Exclude()
  deletedAt?: Date;

  constructor(partial: Partial<ProductEntity>) {
    Object.assign(this, partial);
  }
}
