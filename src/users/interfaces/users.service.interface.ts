import { Role, User } from '@prisma/client';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { SanitizedUser } from './sanitized-user.interface';

export const USERS_SERVICE = 'USERS_SERVICE';

export interface IUsersService {
  create(data: {
    email: string;
    password: string;
    fullName?: string | null;
    role?: Role;
  }): Promise<SanitizedUser>;
  findById(id: string): Promise<SanitizedUser>;
  findByEmailRaw(email: string): Promise<User | null>;
  findAll(
    page: number,
    limit: number,
  ): Promise<{
    data: Omit<User, 'passwordHash'>[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>;
  updateProfile(userId: string, dto: UpdateProfileDto): Promise<SanitizedUser>;
}
