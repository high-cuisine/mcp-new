import { forwardRef, Module } from '@nestjs/common';
import { TelegramService } from './servises/telegram.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotUpdate } from './telegram.update';
import { cfg } from '@common/config/config.service';
import { RedisModule } from '@infra/redis/redis.module';
import { ProccesorModule } from '../proccesor/proccesor.module';
import { ClientModule } from '../client/client.module';
import { CrmModule } from '../crm/crm.module';
import * as LocalSession from 'telegraf-session-local'
import { CreateAppointmentScene } from './scenes/createAppointment';
import { CancelAppointmentScene } from './scenes/cancelAppointment';
import { ShowAppointmentScene } from './scenes/showAppointment';
import { MoveAppointmentScene } from './scenes/moveAppointment';
import { ConfigModule, ConfigService } from '@nestjs/config';

const session = new LocalSession()

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          token: cfg.telegram.token,
          middlewares: [session.middleware()],
        }),
    }),
    RedisModule,
    ProccesorModule,
    ClientModule,
    CrmModule,
  ],
  providers: [BotUpdate, TelegramService, CreateAppointmentScene, CancelAppointmentScene, ShowAppointmentScene, MoveAppointmentScene],
  exports: [TelegramService]
})
export class TelegramModule {}
