import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { USERS_REPOSITORY } from './interfaces/users.repository.interface';
import { USERS_SERVICE } from './interfaces/users.service.interface';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [
    {
      provide: USERS_SERVICE,
      useClass: UsersService,
    },
    {
      provide: USERS_REPOSITORY,
      useClass: UsersRepository,
    },
  ],
  exports: [USERS_SERVICE],
})
export class UsersModule {}
