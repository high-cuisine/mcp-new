import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";

@Injectable()
export class DoctorService {
    constructor(
        private readonly crmService: CrmService
    ) {
        this.getDoctors().then(doctors => {
            console.log(JSON.stringify(doctors));
        });
    }

    async getDoctors() {
        return await this.crmService.getDoctors();
    }
}