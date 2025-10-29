import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from '@node-rs/bcrypt';
import { parseJwtExpiresIn } from '../common/utils/jwt';
import {
  IUsersService,
  USERS_SERVICE,
} from '../users/interfaces/users.service.interface';
import { SanitizedUser } from '../users/interfaces/sanitized-user.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: IUsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName ?? null,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const existing = await this.usersService.findByEmailRaw(dto.email);
    if (!existing || !existing.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!existing.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    const passwordValid = await compare(dto.password, existing.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersService.findById(existing.id);
    return this.buildAuthResponse(user);
  }

  async buildAuthResponse(user: SanitizedUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const { accessToken, refreshToken } = await this.generateTokens(payload);

    return {
      tokenType: 'Bearer',
      accessToken,
      refreshToken,
      expiresIn: this.configService.getOrThrow<string>('JWT_EXPIRES_IN'),
      user,
    };
  }

  private async generateTokens(payload: JwtPayload) {
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: parseJwtExpiresIn(
        this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
      ),
    });

    return { accessToken, refreshToken };
  }
}
