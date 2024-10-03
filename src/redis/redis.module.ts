import { ConfigModule, ConfigService } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import { createClient } from 'redis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_SERVICE',
      useFactory: async () => {
        const redisService = createClient({
          socket: {
            host: process.env.REDIS_HOST,
            port: +process.env.REDIS_PORT,
          },
        });
        redisService.on('error', (err) => {
          console.log('Redis Client Error', err);
        });
        redisService.on('connect', (connect) => {
          console.log('Redis Client Connected', connect);
        });
        await redisService.connect();
        return redisService;
      },
    },
  ],
  exports: ['REDIS_SERVICE'],
})
export class RedisModule {}
