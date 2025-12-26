import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProccesorModule } from './proccesor/proccesor.module';
import { TelegramModule } from './telegram/telegram.module';
import { MongooseModule } from '@infra/mongoose/mongoose.module';
import { UserModule } from './user/user.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { TelegramBotsModule } from './telegram-bots/telegram-bots.module';
import { WhatsappBotsModule } from './whatsapp-bots/whatsapp-bots.module';
import { RagModule } from '@infra/rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    forwardRef(() => ProccesorModule),
    MongooseModule,
    UserModule,
    AppointmentsModule,
    TelegramBotsModule,
    WhatsappBotsModule,
    RagModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
