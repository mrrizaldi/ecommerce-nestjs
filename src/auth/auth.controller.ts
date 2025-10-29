import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate user' })
  login() {
    return this.authService.login();
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  me() {
    return this.authService.profile('todo');
  }
}
