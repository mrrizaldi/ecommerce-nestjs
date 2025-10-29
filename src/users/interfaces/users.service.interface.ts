import { User } from '@prisma/client';
import { RegisterDto } from '../../auth/dto/register.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { SanitizedUser } from './sanitized-user.interface';

export const USERS_SERVICE = 'USERS_SERVICE';

export interface IUsersService {
  create(dto: Omit<RegisterDto, 'email' | 'fullName'> & { email: string; fullName: string | null }): Promise<SanitizedUser>;
  findById(id: string): Promise<SanitizedUser | null>;
  findByEmailRaw(email: string): Promise<(User & { passwordHash: string | null }) | null>;
  findAll(page: number, limit: number): Promise<any>;
  updateProfile(userId: string, dto: UpdateProfileDto): Promise<SanitizedUser>;
}
