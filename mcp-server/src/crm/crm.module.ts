import { forwardRef, Module } from "@nestjs/common";
import { CrmService } from "./services/crm.service";
import { ServicesService } from "./services/services.service";
import { ClinicService } from "./services/clinic.service";
import { DoctorService } from "./services/doctor.service";
import { AppointmentService } from "./services/appointments.service";
import { ClientService } from "./services/client.service";
import { PetService } from "./services/pet.service";
import { RedisModule } from "@infra/redis/redis.module";
import { TelegramBotsModule } from "src/telegram-bots/telegram-bots.module";
import { ClientModule } from "src/client/client.module";

@Module({
    imports:[RedisModule, forwardRef(() => TelegramBotsModule), ClientModule],
    providers:[CrmService, ServicesService, ClinicService, DoctorService, AppointmentService, ClientService, PetService],
    exports:[CrmService, ServicesService, ClinicService, DoctorService, AppointmentService, ClientService, PetService]
})
export class CrmModule {} 