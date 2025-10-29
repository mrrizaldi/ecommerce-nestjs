import {
  INestApplication,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    console.log('✅ Database connected successfully');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    console.log('🔌 Database connection closed');
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  // Helper untuk soft delete (jika perlu)
  async softDelete<T>(model: any, where: any): Promise<T> {
    return model.update({
      where,
      data: { deletedAt: new Date() },
    });
  }

  // Helper untuk clean transactions
  cleanForJson(data: any): any {
    return JSON.parse(
      JSON.stringify(data, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
  }
}
