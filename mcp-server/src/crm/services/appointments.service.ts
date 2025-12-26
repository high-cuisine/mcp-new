import { forwardRef, Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { Admission } from "@common/entities/admission.entity";
import { RedisService } from "@infra/redis/redis.service";
import { TelegramBotsService } from "src/telegram-bots/telegram-bots.service";
import { ClientRepository } from "src/client/repositorys/client.repository";


@Injectable()
export class AppointmentService implements OnModuleInit {
    constructor(
        private readonly crmService: CrmService,
        private readonly redisService: RedisService,
        @Inject(forwardRef(() => TelegramBotsService)) 
        private readonly telegramBotsService: TelegramBotsService,
        private readonly clientRepository: ClientRepository
    ) {}

    async onModuleInit() {
        //this.loop();
    }

    async findAppointmentForUser(clientId: number, clinicId: number): Promise<Admission[] | null> {
        // Получаем записи для клиента на год вперед
        console.log(clientId, clinicId)
        const appointment = await this.crmService.getAppointmentsForClientForYear(clientId, clinicId, new Date().toISOString());

        return appointment.data?.admission || null;
    }

    async getAppointments<T>(): Promise<T | null> {
        const appointments = await this.crmService.getAppointments();
        return appointments.data?.admission || null;
    }

    async loop() {
        while(true) {
            const appointments = await this.getAppointments<Admission[]>();
            const now = new Date();
            const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
            const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            
            const filteredAppointments = appointments?.filter(el => {
                const appointmentDate = new Date(el.admission_date);
                return appointmentDate >= in23Hours && appointmentDate <= in24Hours;
            });
            
            if (filteredAppointments && filteredAppointments.length > 0) {
                const appointmentIndex = await this.redisService.getSet('appointments:index');
                const newIndex = filteredAppointments?.map(el => el.id);
                const uniqIndex = appointmentIndex?.filter(el => !newIndex?.includes(el));

                await this.redisService.addSet('appointments:index', uniqIndex!.join(','), { EX: 24 * 60 * 60 });

                for(const index of uniqIndex!) {
                    const appointment = filteredAppointments?.find(el => el.id === index);
                    if (!appointment) continue;

                    await this.redisService.set(index.toString(), JSON.stringify({...appointment, status: 'active'}), { EX: 24 * 60 * 60 });
                    
                    const phone = appointment.client?.cell_phone;
                    if (!phone) continue;

                    // Ищем пользователя по телефону
                    const user = await this.clientRepository.findByPhone(phone);
                    
                    if (user && (user as any).telegram_id) {
                        // Запускаем сцену подтверждения (она сама отправит начальное сообщение)
                        await this.telegramBotsService.startConfirmAppointmentScene((user as any).telegram_id, appointment.id.toString(), phone);
                    } else {
                        // Если пользователь не найден, просто отправляем сообщение
                        await this.telegramBotsService.sendMessage(phone, `Ваш прием наступит через 24 часа`);
                    }
                }


            }

           
            await new Promise(resolve => setTimeout(resolve, 1000 * 5));
        }
    }
}