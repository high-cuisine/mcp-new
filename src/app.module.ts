import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProccesorModule } from './proccesor/proccesor.module';
import { TelegramModule } from './telegram/telegram.module';
import { MongooseModule } from '@infra/mongoose/mongoose.module';
import { UserModule } from './user/user.module';
import { AppointmentsModule } from './appointments/appointments.module';

@Module({
  imports: [ConfigModule.forRoot(), ProccesorModule, TelegramModule, MongooseModule, UserModule, AppointmentsModule ],
  controllers: [],
  providers: [],
})
export class AppModule {}
