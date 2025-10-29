import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/bcrypt';
import { Role } from '@prisma/client';
import {
  IUsersRepository,
  USERS_REPOSITORY,
} from './interfaces/users.repository.interface';
import { IUsersService } from './interfaces/users.service.interface';
import { SanitizedUser } from './interfaces/sanitized-user.interface';

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
  ) {}

  async findById(id: string): Promise<SanitizedUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.sanitizeUser(user);
  }

  async findByEmail(email: string): Promise<SanitizedUser | null> {
    const user = await this.usersRepository.findByEmail(email);
    return user ? this.sanitizeUser(user) : null;
  }

  async findByEmailRaw(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async create(data: {
    email: string;
    password: string;
    fullName?: string | null;
    role?: Role;
  }): Promise<SanitizedUser> {
    const existing = await this.usersRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await hash(data.password, 10);

    const user = await this.usersRepository.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role ?? Role.USER,
      },
    });

    return this.sanitizeUser(user);
  }

  async update(
    id: string,
    data: { fullName?: string; phone?: string },
  ): Promise<SanitizedUser> {
    await this.findById(id);
    const updated = await this.usersRepository.update({ where: { id }, data });
    return this.sanitizeUser(updated);
  }

  async delete(id: string) {
    await this.findById(id);
    const deleted = await this.usersRepository.delete({ where: { id } });
    return this.sanitizeUser(deleted);
  }

  async findAll(page = 1, limit = 20) {
    return this.usersRepository.findAll(page, limit);
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string; phone?: string },
  ): Promise<SanitizedUser> {
    return this.update(userId, data);
  }

  private sanitizeUser(user: any): SanitizedUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user;
    return rest as SanitizedUser;
  }
}
