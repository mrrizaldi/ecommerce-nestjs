import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const ttlSeconds = config.get<number>('CACHE_TTL_SECONDS', 60);
        const ttl = ttlSeconds * 1000;
        const redisUrl = config.get<string>('REDIS_URL');

        if (redisUrl) {
          try {
            const [{ default: KeyvRedis }, { default: Keyv }] = await Promise.all([
              import('@keyv/redis'),
              import('keyv'),
            ]);

            const redisStore = new KeyvRedis(redisUrl);
            const keyvInstance = new Keyv({
              store: redisStore,
              namespace: 'ecom:',
            });

            return {
              stores: [keyvInstance],
              ttl,
            };
          } catch (error) {
            console.warn(
              'Redis cache store initialization failed. Falling back to in-memory cache.',
              error instanceof Error ? error.message : error,
            );
          }
        }

        return {
          ttl,
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.confirmPassword',
            'req.body.token',
          ],
          remove: true,
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'HH:MM:ss.l',
                  ignore: 'pid,hostname',
                  singleLine: false,
                },
              },
        customProps: (req) => ({
          requestId: req.id,
        }),
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CartModule,
    OrdersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
