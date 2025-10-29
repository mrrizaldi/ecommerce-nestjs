import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders' })
  list(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.ordersService.list(Number(page), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details' })
  detail(@Param('id') id: string) {
    return this.ordersService.detail(id);
  }
}
