import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { Admission } from "@common/entities/admission.entity";

@Injectable()
export class AppointmentService {
    constructor(
        private readonly crmService: CrmService
    ) {}

    async findAppointmentForUser(clientId: number, clinicId: number): Promise<Admission[] | null> {
        // Получаем записи для клиента на год вперед
        console.log(clientId, clinicId)
        const appointment = await this.crmService.getAppointmentsForClientForYear(clientId, clinicId, new Date().toISOString());

        return appointment.data?.admission || null;
    }
}