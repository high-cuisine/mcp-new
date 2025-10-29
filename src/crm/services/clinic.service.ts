import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { RedisService } from "@infra/redis/redis.service";

@Injectable()
export class ClinicService {
    constructor(
        private readonly crmService: CrmService,
        private readonly redisService: RedisService
    ) {}

    async getClinics() {
        return await this.crmService.getClinics();
    }

    async setClinicInCache(clinic: any) {
        return await this.redisService.set('clinic', JSON.stringify(clinic.clinics[0]), { EX: 60 * 60 * 24 * 30 });
    }

    async getClinicFromCache() {
        return await this.redisService.get('clinic');
    }
}