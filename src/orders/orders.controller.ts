import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SanitizedUser } from '../users/interfaces/sanitized-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderEntity } from './entities/order.entity';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Create a new order from current cart' })
  async create(
    @CurrentUser() user: SanitizedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderEntity> {
    return this.ordersService.createOrder(user.id, dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'List current user orders' })
  async list(
    @CurrentUser() user: SanitizedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.listForUser(
      user.id,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Get(':orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get order details for current user' })
  async detail(
    @CurrentUser() user: SanitizedUser,
    @Param('orderId') orderId: string,
  ): Promise<OrderEntity> {
    return this.ordersService.getOrderForUser(user.id, orderId);
  }

  // NOTE: /payments/callback endpoint will be implemented in a future iteration.
}
