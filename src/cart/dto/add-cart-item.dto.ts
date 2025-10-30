import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ description: 'Product variant identifier', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ description: 'Desired quantity', example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;
}
