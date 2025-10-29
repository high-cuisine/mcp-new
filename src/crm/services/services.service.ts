import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { RedisService } from "@infra/redis/redis.service";

@Injectable()
export class ServicesService {
    constructor(
        private readonly crmService: CrmService,
       
    ) {}

   

    async getServices() {
        const clinics = await this.crmService.getClinics();
        let servicesList: string[] = [];
        
        for(const clinic of clinics.data.clinics) {
            const services = await this.crmService.getServices(clinic.id) as any;

            for(const el of services.data.good) {
                servicesList.push(el.title);
            }
        }

        return servicesList;
    }
}