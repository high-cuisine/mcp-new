import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppointmentsService } from './serivces/appointments.service';
import { AppointmentsWorkerService } from './serivces/appointments-worker.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [AppointmentsService, AppointmentsWorkerService]
})
export class AppointmentsModule {}
