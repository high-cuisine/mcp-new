import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { Client } from "@common/entities/client.entity";

@Injectable()
export class ClientService {
    constructor(
        private readonly crmService: CrmService
    ) {
    }

    async getClients() {
        return await this.crmService.getClients();
    }

    async createClient(last_name: string, first_name: string, middle_name: string, cell_phone: string) {
        try {
            let processedPhone = cell_phone.toString();
            
            if (processedPhone.startsWith('8')) {
                processedPhone = '+7' + processedPhone.substring(1);
            }
            
            if (processedPhone.startsWith('+7')) {
                processedPhone = processedPhone.substring(2);
            }
            
            const result = await this.crmService.createClient(last_name, first_name, middle_name, processedPhone);
            return result;
        } catch (error) {
            console.error('Error in ClientService.createClient:', error);
            throw new Error(`Failed to create client: ${error.message}`);
        }
    }

    async getClinetByPhone(phone: string): Promise<Client | null> {
        return await this.crmService.getClientByPhone(phone);
    }
}