import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";

@Injectable()
export class RedisService {
    constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

    async get(key: string) {
        return await this.redisClient.get(key);
    }

    async set(key: string, value: string, options?: { EX: number }) {
        return await this.redisClient.set(key, value, 'EX', options?.EX ?? 0);
    }

    async delete(key: string) {
        return await this.redisClient.del(key);
    }

    async addSet(key: string, value: string, p0: { EX: number; }) {
        return await this.redisClient.sadd(key, value);
    }

    async removeSet(key: string, value: string) {
        return await this.redisClient.srem(key, value);
    }

    async getSet(key: string) {
        return await this.redisClient.smembers(key);
    }
}