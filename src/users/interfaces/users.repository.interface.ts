import { Prisma, User } from '@prisma/client';

export const USERS_REPOSITORY = 'USERS_REPOSITORY';

export interface IUsersRepository {
  create(args: Prisma.UserCreateArgs): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  update(args: Prisma.UserUpdateArgs): Promise<User>;
  delete(args: Prisma.UserDeleteArgs): Promise<User>;
  findAll(page: number, limit: number): Promise<{
    data: Omit<User, 'passwordHash'>[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>;
}
