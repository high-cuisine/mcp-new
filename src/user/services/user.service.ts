import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '@infra/redis/redis.service';
import { UserInfoRto } from '../rto/user-info.rto';

@Injectable()
export class UserService {
	private readonly logger = new Logger(UserService.name);

	constructor(
		private readonly redisService: RedisService,
	) {}

    
}
