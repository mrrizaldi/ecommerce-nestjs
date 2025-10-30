import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { USERS_SERVICE } from '../users/interfaces/users.service.interface';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';

jest.mock('@node-rs/bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    create: jest.Mock;
    findByEmailRaw: jest.Mock;
    findById: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };

  const sanitizedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.USER,
  };

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findByEmailRaw: jest.fn(),
      findById: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('token'),
    };
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        throw new Error(`Unknown config ${key}`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USERS_SERVICE, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('creates user and returns auth response', async () => {
      usersService.create.mockResolvedValue(sanitizedUser);
      jwtService.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      const result = await service.register({
        email: 'user@example.com',
        password: 'password123',
        fullName: 'User',
      });

      expect(usersService.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
        fullName: 'User',
      });
      expect(result.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
    });
  });

  describe('login', () => {
    const bcrypt = require('@node-rs/bcrypt');

    it('throws UnauthorizedException when user not found', async () => {
      usersService.findByEmailRaw.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@example.com', password: 'secret' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when inactive', async () => {
      usersService.findByEmailRaw.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hash',
        isActive: false,
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'secret' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns tokens when credentials valid', async () => {
      usersService.findByEmailRaw.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hash',
        isActive: true,
      });
      usersService.findById.mockResolvedValue(sanitizedUser);
      jwtService.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');
      bcrypt.compare.mockResolvedValue(true);

      const result = await service.login({
        email: 'user@example.com',
        password: 'secret',
      });

      expect(usersService.findByEmailRaw).toHaveBeenCalledWith('user@example.com');
      expect(result.accessToken).toBe('access');
      expect(result.user).toMatchObject({ id: 'user-1' });
    });
  });
});

