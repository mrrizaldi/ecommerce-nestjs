import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Headers,
  Param,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizedUser } from '../users/interfaces/sanitized-user.interface';
import { CartEntity } from './entities/cart.entity';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve the current user cart' })
  async getCart(@CurrentUser() user: SanitizedUser): Promise<CartEntity> {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an item to the cart (idempotent)' })
  async addItem(
    @CurrentUser() user: SanitizedUser,
    @Body() dto: AddCartItemDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CartEntity> {
    return this.cartService.addItem(user.id, dto, idempotencyKey);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  async removeItem(
    @CurrentUser() user: SanitizedUser,
    @Param('itemId') itemId: string,
  ): Promise<CartEntity> {
    return this.cartService.removeItem(user.id, itemId);
  }
}
