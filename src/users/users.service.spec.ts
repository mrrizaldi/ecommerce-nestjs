import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { USERS_REPOSITORY } from './interfaces/users.repository.interface';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { Role } from '@prisma/client';

jest.mock('@node-rs/bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

type UsersRepositoryMock = Partial<Record<keyof UsersRepository, jest.Mock>>;

const createRepositoryMock = (): UsersRepositoryMock => ({
  findById: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findAll: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repository: UsersRepositoryMock;

  beforeEach(async () => {
    repository = createRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: USERS_REPOSITORY,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findById', () => {
    it('returns sanitized user when found', async () => {
      repository.findById?.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'secret',
        role: Role.USER,
      });

      const result = await service.findById('user-1');

      expect(result).toMatchObject({
        id: 'user-1',
        email: 'test@example.com',
        role: Role.USER,
      });
      expect(repository.findById).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException when user missing', async () => {
      repository.findById?.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('hashes password and persists user', async () => {
      repository.findByEmail?.mockResolvedValue(null);
      repository.create?.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        fullName: 'New User',
        passwordHash: 'hashed-password',
        role: Role.USER,
      });

      const result = await service.create({
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New User',
      });

      expect(repository.findByEmail).toHaveBeenCalledWith('new@example.com');
      expect(repository.create).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          passwordHash: 'hashed-password',
          fullName: 'New User',
          role: Role.USER,
        },
      });
      expect(result.email).toBe('new@example.com');
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws ConflictException when email exists', async () => {
      repository.findByEmail?.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({
          email: 'existing@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('deletes user after existence check', async () => {
      repository.findById?.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.USER,
      });
      repository.delete?.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.USER,
      });

      const result = await service.delete('user-1');

      expect(repository.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result.id).toBe('user-1');
    });
  });
});
