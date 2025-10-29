import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import Redis from 'ioredis';
import { cfg } from '@common/config/config.service';

@Global()
@Module({
	providers: [
		{
			provide: 'REDIS_CLIENT',
			useFactory: () => {
				return new Redis({
					host: cfg.redis.host,
					port: parseInt(cfg.redis.port || '6379'),
					password: cfg.redis.password,
				});
			},
		},
		RedisService,
	],
	exports: [RedisService],
})
export class RedisModule {}
