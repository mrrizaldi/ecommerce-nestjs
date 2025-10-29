import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) { }

  async findById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async create(data: { email: string; password: string; fullName?: string }) {
    const existing = await this.usersRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    return this.usersRepository.create({
      email: data.email,
      passwordHash,
      fullName: data.fullName,
    });
  }

  async update(id: string, data: { fullName?: string; phone?: string }) {
    await this.findById(id);
    return this.usersRepository.update(id, data);
  }

  async delete(id: string) {
    await this.findById(id);
    return this.usersRepository.delete(id);
  }

  async findAll(page = 1, limit = 20) {
    return this.usersRepository.findAll(page, limit);
  }
}
