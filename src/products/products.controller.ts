import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
@UseInterceptors(ClassSerializerInterceptor)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all products' })
  @ApiResponse({ status: 200, type: [ProductEntity] })
  list(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.productsService.list(+page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, type: ProductEntity })
  detail(@Param('id') id: string) {
    return this.productsService.detail(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new product (admin only)' })
  @ApiResponse({ status: 201, type: ProductEntity })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }
}
