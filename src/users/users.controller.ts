import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  list() {
    return this.usersService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details' })
  detail(@Param('id') id: string) {
    return this.usersService.detail(id);
  }
}
