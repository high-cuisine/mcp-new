import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Appointment } from 'libs/shared/interface/appointment.interface';
import { RedisService } from '@infra/redis/redis.service';

@Injectable()
export class AppointmentsWorkerService {

    constructor(
        private readonly redisService: RedisService,
    ) {}

    @Cron(CronExpression.EVERY_10_SECONDS)
    async handleAppointments() {
        //console.log('Processing appointments...');
        // Здесь будет логика обработки записей на прием
    }
}
