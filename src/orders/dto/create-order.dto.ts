import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum PaymentMethod {
  MANUAL_TRANSFER = 'MANUAL_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
  EWALLET = 'EWALLET',
}

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Variant ID from the cart item', example: 'variant-uuid' })
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ description: 'Quantity to order', example: 2, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Cart identifier to checkout', example: 'cart-uuid' })
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @ApiProperty({ description: 'Items being purchased' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiProperty({ description: 'Currency in ISO 4217 format', example: 'IDR' })
  @IsString()
  @MaxLength(3)
  currency!: string;

  @ApiProperty({ description: 'Subtotal amount (in smallest currency unit)', example: 1250000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  subtotalAmount!: number;

  @ApiPropertyOptional({ description: 'Shipping amount (in smallest currency unit)', example: 15000, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingAmount?: number;

  @ApiPropertyOptional({ description: 'Discount amount (in smallest currency unit)', example: 5000, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @ApiProperty({ description: 'Total amount (subtotal + shipping - discount)', example: 1260000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  totalAmount!: number;

  @ApiPropertyOptional({ description: 'Optional billing address ID', example: 'address-uuid' })
  @IsString()
  @IsOptional()
  billingAddressId?: string;

  @ApiPropertyOptional({ description: 'Optional shipping address ID', example: 'address-uuid' })
  @IsString()
  @IsOptional()
  shippingAddressId?: string;

  @ApiPropertyOptional({ description: 'Preferred payment method', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;
}
