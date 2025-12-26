import { RedisService } from '@infra/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { Appointment } from '@shared/interface/appointment.interface';

@Injectable()
export class AppointmentsService {

    constructor(
        private readonly redisService: RedisService,    
    ) {}

    private async setAppointmentIndexInCache(appointment: Appointment, timeInCache: number) {   
        await this.redisService.addSet('appointments:index', appointment.id.toString(), { EX: timeInCache });
    }

    async setAppointmentInCache(appointment: Appointment) {
        const timeInCache = new Date(appointment.admission_date).getTime() - new Date().getTime();
        if(timeInCache > 0) {
            await this.setAppointmentIndexInCache(appointment, timeInCache);
            await this.redisService.set(appointment.id.toString(), JSON.stringify({...appointment, status: 'active'}), { EX: timeInCache });
        }
    }

    async getAppointmentFromCache(id: number) {
        const appointment = await this.redisService.get(id.toString());
        return appointment ? JSON.parse(appointment) : null;
    }

    async getAppointmentIndexFromCache() {
        return await this.redisService.getSet('appointments:index');
    }

    async updateAppointmentInCache(appointment: Appointment) {
        await this.redisService.set(appointment.id.toString(), JSON.stringify({...appointment, status: 'active'}), { EX: 60 * 60 * 24 * 30 }); // 30 days
    }

    async deleteAppointmentFromCache(id: number) {
        await this.redisService.delete(id.toString());
        await this.redisService.removeSet('appointments:index', id.toString());
    }

    async findDoctorAndServiceForAppointment(userService: string) {
        
    }

    async findAppointmentForUser(id:number) {
        
    }
}